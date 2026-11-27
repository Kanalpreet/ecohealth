"""Routine API schemas. member_id is never accepted from clients."""

import uuid
from datetime import time
from typing import Annotated, Self

from pydantic import AwareDatetime, Field, StringConstraints, field_validator, model_validator

from app.core.constants import ACTIVITY_MAX_LENGTH, WEEKDAYS, Weekday
from app.schemas.common import InputSchema, ReadSchema, reject_explicit_nulls

Activity = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=ACTIVITY_MAX_LENGTH)]
DaysOfWeek = Annotated[list[Weekday], Field(min_length=1, max_length=len(WEEKDAYS))]


def _lowercase_days(value: object) -> object:
    if isinstance(value, list):
        return [d.lower() if isinstance(d, str) else d for d in value]
    return value


def _canonical_days(value: list[str] | None) -> list[str] | None:
    """Remove duplicates and sort Monday to Sunday."""
    return None if value is None else sorted(set(value), key=WEEKDAYS.index)


def _require_naive_time(value: time | None) -> time | None:
    # A routine time is local wall-clock time; the user's time zone gives it meaning.
    if value is not None and value.tzinfo is not None:
        raise ValueError("start_time must not include a time zone offset")
    return value


class RoutineCreate(InputSchema):
    activity: Activity
    start_time: time
    days_of_week: DaysOfWeek

    _lower = field_validator("days_of_week", mode="before")(_lowercase_days)
    _canonical = field_validator("days_of_week")(_canonical_days)
    _naive = field_validator("start_time")(_require_naive_time)


class RoutineUpdate(InputSchema):
    activity: Activity | None = None
    start_time: time | None = None
    days_of_week: DaysOfWeek | None = None

    _lower = field_validator("days_of_week", mode="before")(_lowercase_days)
    _canonical = field_validator("days_of_week")(_canonical_days)
    _naive = field_validator("start_time")(_require_naive_time)

    @model_validator(mode="after")
    def no_nulls(self) -> Self:
        reject_explicit_nulls(self, ("activity", "start_time", "days_of_week"))
        return self


class RoutineRead(ReadSchema):
    id: uuid.UUID
    member_id: uuid.UUID
    activity: str
    start_time: time
    days_of_week: list[str]
    created_at: AwareDatetime
    updated_at: AwareDatetime
