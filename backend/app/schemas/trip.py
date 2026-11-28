"""Trip API schemas (docs/travel.md, docs/api-contract-trips-alerts.md).

user_id is never accepted from clients; member_ids are checked against the current
user's members in app/services/trips.py. Error messages name fields and stop
numbers only, never submitted values.
"""

import uuid
from collections.abc import Sequence
from datetime import date
from typing import Annotated, Protocol, Self

from pydantic import AwareDatetime, Field, StringConstraints, field_validator, model_validator

from app.core.constants import (
    MAX_STOPS_PER_TRIP,
    MAX_TRAVELLERS_PER_TRIP,
    MAX_TRIP_DAYS,
    PLACE_MAX_LENGTH,
    TripType,
)
from app.schemas.common import InputSchema, Name, ReadSchema, dedupe, reject_explicit_nulls
from app.schemas.user import Latitude, Longitude, _round_coordinate

Place = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=PLACE_MAX_LENGTH)]
MemberIds = Annotated[list[uuid.UUID], Field(min_length=1, max_length=MAX_TRAVELLERS_PER_TRIP)]


class _DatedStop(Protocol):
    arrive_date: date
    leave_date: date


def check_trip_dates(start: date, end: date, stops: Sequence[_DatedStop]) -> None:
    """Trip and stop date rules (raises ValueError with a safe message).

    - start <= end, at most MAX_TRIP_DAYS days (inclusive)
    - each stop: arrive <= leave, inside the trip dates
    - stops in travel order: a stop arrives on or after the previous stop's leave date
    """
    if end < start:
        raise ValueError("end_date must be on or after start_date")
    if (end - start).days + 1 > MAX_TRIP_DAYS:
        raise ValueError(f"a trip can be at most {MAX_TRIP_DAYS} days long")
    previous_leave: date | None = None
    for number, stop in enumerate(stops, start=1):
        if stop.leave_date < stop.arrive_date:
            raise ValueError(f"stop {number}: leave_date must be on or after arrive_date")
        if stop.arrive_date < start or stop.leave_date > end:
            raise ValueError(f"stop {number}: dates must be within the trip dates")
        if previous_leave is not None and stop.arrive_date < previous_leave:
            raise ValueError(f"stop {number}: arrives before the previous stop is left (check the order)")
        previous_leave = stop.leave_date


# ---- input ----


class TripStopInput(InputSchema):
    place: Place
    lat: Latitude
    lon: Longitude
    arrive_date: date
    leave_date: date

    _round = field_validator("lat", "lon")(_round_coordinate)  # 2 decimals (~1 km), half-up


Stops = Annotated[list[TripStopInput], Field(min_length=1, max_length=MAX_STOPS_PER_TRIP)]


class TripCreate(InputSchema):
    name: Name
    trip_type: TripType
    start_date: date
    end_date: date
    member_ids: MemberIds
    stops: Stops  # in travel order

    _dedupe = field_validator("member_ids")(dedupe)

    @model_validator(mode="after")
    def dates_consistent(self) -> Self:
        check_trip_dates(self.start_date, self.end_date, self.stops)
        return self


class TripUpdate(InputSchema):
    """Partial update. `stops` and `member_ids`, when sent, REPLACE the existing lists.
    Date rules are re-checked on the merged trip in the service."""

    name: Name | None = None
    trip_type: TripType | None = None
    start_date: date | None = None
    end_date: date | None = None
    member_ids: MemberIds | None = None
    stops: Stops | None = None

    @field_validator("member_ids")
    @classmethod
    def dedupe_members(cls, value: list[uuid.UUID] | None) -> list[uuid.UUID] | None:
        return None if value is None else dedupe(value)

    @model_validator(mode="after")
    def no_nulls(self) -> Self:
        reject_explicit_nulls(self, ("name", "trip_type", "start_date", "end_date", "member_ids", "stops"))
        return self


# ---- output ----


class TripStopRead(ReadSchema):
    position: int
    place: str
    lat: float
    lon: float
    elevation_m: float | None
    arrive_date: date
    leave_date: date


class TripRead(ReadSchema):
    id: uuid.UUID
    name: str
    trip_type: TripType
    start_date: date
    end_date: date
    member_ids: list[uuid.UUID]
    stops: list[TripStopRead]
    created_at: AwareDatetime
    updated_at: AwareDatetime


class TripStopSummary(ReadSchema):
    position: int
    place: str
    elevation_m: float | None


class TripSummary(ReadSchema):
    """GET /trips list item."""

    id: uuid.UUID
    name: str
    trip_type: TripType
    start_date: date
    end_date: date
    member_ids: list[uuid.UUID]
    stops: list[TripStopSummary]
