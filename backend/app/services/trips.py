"""Trips, ALWAYS scoped to their owner (IDOR protection, design.md §5). See docs/travel.md.

Functions never commit; the API layer owns the transaction.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.constants import MAX_TRIPS_PER_USER
from app.models import FamilyMember, Trip, TripStop, User
from app.schemas.trip import (
    TripCreate,
    TripRead,
    TripStopInput,
    TripStopRead,
    TripStopSummary,
    TripSummary,
    TripUpdate,
    check_trip_dates,
)
from app.services.family import LimitReachedError, NotFoundError


class TripValidationError(ValueError):
    """Business-rule violation reported as 422 (safe message, no submitted values)."""


# ---- reading ----


def _query(user: User):
    return (
        select(Trip)
        .where(Trip.user_id == user.id)
        .options(selectinload(Trip.stops), selectinload(Trip.members))
    )


def list_trips(db: Session, user: User) -> list[Trip]:
    """Newest first (by creation time)."""
    return list(db.execute(_query(user).order_by(Trip.created_at.desc(), Trip.id)).scalars())


def get_trip(db: Session, user: User, trip_id: uuid.UUID) -> Trip:
    trip = db.execute(_query(user).where(Trip.id == trip_id)).scalar_one_or_none()
    if trip is None:
        raise NotFoundError
    return trip


def _member_ids(trip: Trip) -> list[uuid.UUID]:
    return [m.id for m in sorted(trip.members, key=lambda m: (m.created_at, m.id))]


def to_read(trip: Trip) -> TripRead:
    return TripRead(
        id=trip.id,
        name=trip.name,
        trip_type=trip.trip_type,
        start_date=trip.start_date,
        end_date=trip.end_date,
        member_ids=_member_ids(trip),
        stops=[TripStopRead.model_validate(s) for s in trip.stops],
        created_at=trip.created_at,
        updated_at=trip.updated_at,
    )


def to_summary(trip: Trip) -> TripSummary:
    return TripSummary(
        id=trip.id,
        name=trip.name,
        trip_type=trip.trip_type,
        start_date=trip.start_date,
        end_date=trip.end_date,
        member_ids=_member_ids(trip),
        stops=[TripStopSummary.model_validate(s) for s in trip.stops],
    )


# ---- validation helpers ----


def owned_members(db: Session, user: User, member_ids: Sequence[uuid.UUID]) -> list[FamilyMember]:
    """The given members, only if ALL belong to the user (else TripValidationError)."""
    members = list(
        db.execute(
            select(FamilyMember).where(FamilyMember.user_id == user.id, FamilyMember.id.in_(list(member_ids)))
        ).scalars()
    )
    if len(members) != len(set(member_ids)):
        # Same message whether an id is unknown or someone else's: nothing is revealed.
        raise TripValidationError("member_ids must be members of your own family")
    return members


def check_trip_limit(db: Session, user: User) -> None:
    count = db.execute(select(func.count()).select_from(Trip).where(Trip.user_id == user.id)).scalar_one()
    if count >= MAX_TRIPS_PER_USER:
        raise LimitReachedError(f"A maximum of {MAX_TRIPS_PER_USER} trips is allowed")


def stop_points(stops: Sequence[TripStopInput]) -> list[tuple[float, float]]:
    return [(float(s.lat), float(s.lon)) for s in stops]


def _build_stops(stops: Sequence[TripStopInput], elevations: Sequence[float | None]) -> list[TripStop]:
    return [
        TripStop(
            position=number,
            place=s.place,
            lat=s.lat,
            lon=s.lon,
            elevation_m=elevation,
            arrive_date=s.arrive_date,
            leave_date=s.leave_date,
        )
        for number, (s, elevation) in enumerate(zip(stops, elevations, strict=True), start=1)
    ]


# ---- writing ----


def create_trip(
    db: Session, user: User, data: TripCreate, members: list[FamilyMember], elevations: Sequence[float | None]
) -> Trip:
    trip = Trip(
        user_id=user.id,
        name=data.name,
        trip_type=data.trip_type,
        start_date=data.start_date,
        end_date=data.end_date,
        members=members,
        stops=_build_stops(data.stops, elevations),
    )
    db.add(trip)
    db.flush()
    return trip


@dataclass(frozen=True)
class _DatedStop:
    arrive_date: date
    leave_date: date


def check_update(trip: Trip, changes: TripUpdate) -> None:
    """Re-check the date rules on the trip as it would look after the update."""
    start = changes.start_date or trip.start_date
    end = changes.end_date or trip.end_date
    stops = changes.stops if changes.stops is not None else [_DatedStop(s.arrive_date, s.leave_date) for s in trip.stops]
    try:
        check_trip_dates(start, end, stops)
    except ValueError as exc:
        raise TripValidationError(str(exc)) from None


def update_trip(
    db: Session,
    trip: Trip,
    changes: TripUpdate,
    members: list[FamilyMember] | None,
    elevations: Sequence[float | None] | None,
) -> Trip:
    for field in ("name", "trip_type", "start_date", "end_date"):
        if field in changes.model_fields_set:
            setattr(trip, field, getattr(changes, field))
    if members is not None:
        trip.members = members
    if changes.stops is not None:
        # Delete the old stops first: inserting the new ones in the same flush could
        # collide with UNIQUE (trip_id, position).
        trip.stops.clear()
        db.flush()
        trip.stops.extend(_build_stops(changes.stops, elevations or [None] * len(changes.stops)))
    db.flush()
    return trip
