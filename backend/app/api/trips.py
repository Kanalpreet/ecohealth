"""/trips: Travel Mode trip CRUD, scoped to the current user (docs/travel.md).

Another user's trip returns 404, exactly like a missing one. Elevation per stop
comes from the cached elevation provider and never fails a request.
"""

import asyncio
import logging
import uuid
from collections.abc import Sequence
from typing import Annotated, Protocol

import anyio.from_thread
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.api.deps import CurrentUser, DbDep
from app.models import Trip, User
from app.schemas.trip import TripCreate, TripRead, TripSummary, TripUpdate
from app.services import trips
from app.services.family import LimitReachedError, NotFoundError
from app.services.trips import TripValidationError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/trips", tags=["trips"])

_TRIP_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")
PLAN_NOT_IMPLEMENTED = "The Trip Health Plan is not available yet (coming in the next backend release)."
ELEVATION_TIMEOUT_SECONDS = 8.0


# ---- elevation provider (optional) ----


class ElevationProvider(Protocol):
    async def get_elevations(self, points: Sequence[tuple[float, float]]) -> list[float | None]: ...


def get_elevation_provider(request: Request) -> ElevationProvider | None:
    """The shared CachedEnvironmentService, or None if it isn't running."""
    return getattr(request.app.state, "environment", None)


ElevationDep = Annotated[ElevationProvider | None, Depends(get_elevation_provider)]


async def _fetch_elevations(provider: ElevationProvider, points: list[tuple[float, float]]) -> list[float | None]:
    return await asyncio.wait_for(provider.get_elevations(points), timeout=ELEVATION_TIMEOUT_SECONDS)


def elevations_for(provider: ElevationProvider | None, points: list[tuple[float, float]]) -> list[float | None]:
    """Called from sync endpoints (worker thread): runs the async provider on the event loop.
    Any failure (provider down, timeout, bug) gives None for every point."""
    if provider is None or not points:
        return [None] * len(points)
    try:
        values = anyio.from_thread.run(_fetch_elevations, provider, points)
        return list(values) if len(values) == len(points) else [None] * len(points)
    except Exception as exc:  # noqa: BLE001 - elevation is optional
        logger.warning("Elevation lookup failed: %s", type(exc).__name__)
        return [None] * len(points)


# ---- helpers ----


def owned_trip(db: DbDep, user: User, trip_id: uuid.UUID) -> Trip:
    try:
        return trips.get_trip(db, user, trip_id)
    except NotFoundError:
        raise _TRIP_NOT_FOUND from None


def _unprocessable(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


# ---- endpoints ----


@router.get("", response_model=list[TripSummary])
def list_trips(user: CurrentUser, db: DbDep) -> list[TripSummary]:
    return [trips.to_summary(t) for t in trips.list_trips(db, user)]


@router.post("", response_model=TripRead, status_code=status.HTTP_201_CREATED)
def create_trip(body: TripCreate, user: CurrentUser, db: DbDep, elevation: ElevationDep) -> TripRead:
    try:
        trips.check_trip_limit(db, user)
        members = trips.owned_members(db, user, body.member_ids)
    except LimitReachedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None
    except TripValidationError as exc:
        raise _unprocessable(exc) from None
    elevations = elevations_for(elevation, trips.stop_points(body.stops))
    trip = trips.create_trip(db, user, body, members, elevations)
    db.commit()
    return trips.to_read(trips.get_trip(db, user, trip.id))


@router.get("/{trip_id}", response_model=TripRead)
def read_trip(trip_id: uuid.UUID, user: CurrentUser, db: DbDep) -> TripRead:
    return trips.to_read(owned_trip(db, user, trip_id))


@router.patch("/{trip_id}", response_model=TripRead)
def update_trip(trip_id: uuid.UUID, body: TripUpdate, user: CurrentUser, db: DbDep, elevation: ElevationDep) -> TripRead:
    trip = owned_trip(db, user, trip_id)
    try:
        trips.check_update(trip, body)
        members = trips.owned_members(db, user, body.member_ids) if body.member_ids is not None else None
    except TripValidationError as exc:
        raise _unprocessable(exc) from None
    elevations = elevations_for(elevation, trips.stop_points(body.stops)) if body.stops is not None else None
    trips.update_trip(db, trip, body, members, elevations)
    db.commit()
    db.expire_all()
    return trips.to_read(trips.get_trip(db, user, trip_id))


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(trip_id: uuid.UUID, user: CurrentUser, db: DbDep) -> Response:
    db.delete(owned_trip(db, user, trip_id))  # stops and traveller links cascade
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{trip_id}/plan", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def trip_plan(trip_id: uuid.UUID, user: CurrentUser, db: DbDep) -> Response:
    """Go T2. Ownership is still checked first: not your trip -> 404."""
    owned_trip(db, user, trip_id)
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=PLAN_NOT_IMPLEMENTED)
