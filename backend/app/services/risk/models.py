"""Pydantic models for risk engine inputs and outputs."""

from datetime import datetime, time
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from app.core.constants import AGE_MAX, AGE_MIN, SENSITIVITY_DEFAULT, SENSITIVITY_MAX, SENSITIVITY_MIN
from app.services.environment.models import SourceKind
from app.services.risk.risk_config import FactorName, LevelName

Context = Literal["home", "travel"]


class _Model(BaseModel):
    model_config = ConfigDict(frozen=True)


# ---- Inputs (can be built from ORM objects: from_attributes) ----


class MemberProfile(_Model):
    model_config = ConfigDict(frozen=True, from_attributes=True)

    name: str | None = None
    age: int = Field(ge=AGE_MIN, le=AGE_MAX)
    conditions: list[str] = Field(default_factory=list)
    sensitivity: float = Field(default=SENSITIVITY_DEFAULT, ge=SENSITIVITY_MIN, le=SENSITIVITY_MAX)


class RoutineInput(_Model):
    model_config = ConfigDict(frozen=True, from_attributes=True)

    activity: str
    start_time: time  # local clock time in the user's time zone
    days_of_week: list[str]


# ---- Outputs ----


class FactorResult(_Model):
    factor: FactorName
    value: float  # the metric the sub-score was computed from (AQI, °C, UV index, m)
    sub_score: float  # 0..1
    weight: float  # base weight x condition multiplier
    contribution_pct: float  # share of the score, %


class MissingFactor(_Model):
    factor: FactorName
    reason: str


class AltitudeRisk(_Model):
    """Trip-level altitude risk, reported separately from the hourly forecast."""

    elevation_m: float | None
    sub_score: float | None  # 0..1, None if elevation unavailable
    applied: bool  # True only in travel context (then included in the overall score)
    note: str


class DataSource(_Model):
    source: SourceKind
    fetched_at: AwareDatetime


class RiskAssessment(_Model):
    engine_version: str
    context: Context
    at_time: AwareDatetime
    score: int  # 0..100
    level: LevelName
    factors: list[FactorResult]  # only factors with data
    contributions: dict[FactorName, float]  # % per factor; sums to 100 when score > 0
    top_factors: list[FactorName]
    inputs: dict[str, float | str | None]  # values actually used
    missing_factors: list[MissingFactor]
    not_applied: list[MissingFactor]  # e.g. altitude in home context
    altitude: AltitudeRisk | None = None  # trip-level; never part of hourly scores
    age_modifier: float
    sensitivity: float
    condition_multipliers: dict[FactorName, float]
    unknown_conditions: list[str]
    data_sources: dict[str, DataSource]
    stale_providers: list[str]
    warnings: list[str]


class HourlyRisk(_Model):
    time: AwareDatetime  # UTC, start of the hour
    score: int
    level: LevelName
    top_factors: list[FactorName]
    missing_factors: list[FactorName]


class SafeWindow(_Model):
    start: AwareDatetime  # UTC
    end: AwareDatetime  # UTC, exclusive
    start_local: datetime
    end_local: datetime
    timezone: str
    hours: int
    worst_level: LevelName


RoutineStatus = Literal["ok", "unsafe", "no_forecast"]


class RoutineCheck(_Model):
    activity: str
    start_time: time
    days_of_week: list[str]
    status: RoutineStatus
    next_occurrence_local: datetime | None
    next_occurrence_utc: AwareDatetime | None
    score: int | None
    level: LevelName | None
    top_factors: list[FactorName]
