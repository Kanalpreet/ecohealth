"""Risk read APIs (no storage of scores yet). See docs/risk-engine.md.

Database access happens in SYNC dependencies (FastAPI runs them in a thread
pool) that return plain data; the async endpoints only await the environment
service and run the pure risk engine.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Protocol
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import AwareDatetime, BaseModel

from app.api.deps import CurrentUser, DbDep
from app.services import family
from app.services.environment.models import EnvironmentSnapshot, GridCell
from app.services.family import NotFoundError
from app.services.risk import (
    HourlyRisk,
    MemberProfile,
    RiskAssessment,
    RoutineCheck,
    RoutineInput,
    SafeWindow,
    assess,
    check_routines,
    hourly_assessment,
    safe_windows,
)
from app.services.risk.risk_config import FactorName, LevelName

router = APIRouter(tags=["risk"])

DISCLAIMER = (
    "EcoHealth is a risk-awareness prototype, not a diagnostic tool and not medical advice. "
    "Scores are estimates from environmental data and simplified thresholds that are pending "
    "review by a doctor. In an emergency or if you feel unwell, contact a qualified healthcare professional."
)
NO_HOME_LOCATION = (
    "Your home location is not set yet. Add it with PATCH /me "
    '(for example {"home_lat": 28.61, "home_lon": 77.21}) to see risk scores.'
)
DATA_UNAVAILABLE = "Environmental data is temporarily unavailable, so no risk score can be given. Please try again later."


# ---- dependencies ----


class SnapshotProvider(Protocol):
    async def get_snapshot(self, latitude: float, longitude: float) -> EnvironmentSnapshot: ...


def get_environment(request: Request) -> SnapshotProvider:
    service = getattr(request.app.state, "environment", None)
    if service is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=DATA_UNAVAILABLE)
    return service


EnvironmentDep = Annotated[SnapshotProvider, Depends(get_environment)]


@dataclass(frozen=True)
class Home:
    latitude: float
    longitude: float
    timezone: str


def get_home(user: CurrentUser) -> Home:
    if user.home_lat is None or user.home_lon is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=NO_HOME_LOCATION)
    return Home(float(user.home_lat), float(user.home_lon), user.timezone)


HomeDep = Annotated[Home, Depends(get_home)]


@dataclass(frozen=True)
class MemberData:
    id: uuid.UUID
    profile: MemberProfile
    routines: list[RoutineInput]


def _member_data(member) -> MemberData:
    return MemberData(
        id=member.id,
        profile=MemberProfile.model_validate(member),
        routines=[RoutineInput.model_validate(r) for r in member.routines],
    )


def get_member_data(member_id: uuid.UUID, user: CurrentUser, db: DbDep) -> MemberData:
    try:
        return _member_data(family.get_member(db, user, member_id, with_routines=True))
    except NotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found") from None


def get_family_data(user: CurrentUser, db: DbDep) -> list[MemberData]:
    return [_member_data(m) for m in family.list_members(db, user, with_routines=True)]


MemberDep = Annotated[MemberData, Depends(get_member_data)]
FamilyDep = Annotated[list[MemberData], Depends(get_family_data)]


# ---- response models ----


class MemberRiskResponse(BaseModel):
    member_id: uuid.UUID
    member_name: str | None
    disclaimer: str
    location: GridCell | None  # grid-cell centre (~5 km), never the exact home
    assessment: RiskAssessment


class HourlyRiskItem(HourlyRisk):
    time_local: datetime


class MemberHourlyRiskResponse(BaseModel):
    member_id: uuid.UUID
    member_name: str | None
    disclaimer: str
    timezone: str
    hourly: list[HourlyRiskItem]
    safe_windows: list[SafeWindow]
    routines: list[RoutineCheck]
    warnings: list[str]


class FamilyRiskCard(BaseModel):
    member_id: uuid.UUID
    name: str | None
    age: int
    score: int
    level: LevelName
    top_factors: list[FactorName]
    missing_factors: list[FactorName]
    next_safe_window: SafeWindow | None
    unsafe_routines: list[str]


class FamilyRiskResponse(BaseModel):
    disclaimer: str
    generated_at: AwareDatetime
    timezone: str
    location: GridCell | None
    data_sources: dict[str, dict]
    warnings: list[str]
    members: list[FamilyRiskCard]


# ---- helpers ----


async def _snapshot(environment: SnapshotProvider, home: Home) -> EnvironmentSnapshot:
    return await environment.get_snapshot(home.latitude, home.longitude)


def _require_data(assessment: RiskAssessment) -> None:
    # Never present "Low" just because every input is missing.
    if not assessment.factors:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=DATA_UNAVAILABLE)


def _hourly_items(hourly: list[HourlyRisk], tz: str) -> list[HourlyRiskItem]:
    zone = ZoneInfo(tz)
    return [HourlyRiskItem(**h.model_dump(), time_local=h.time.astimezone(zone)) for h in hourly]


# ---- endpoints ----


@router.get("/members/{member_id}/risk", response_model=MemberRiskResponse)
async def member_risk(member: MemberDep, home: HomeDep, environment: EnvironmentDep) -> MemberRiskResponse:
    snapshot = await _snapshot(environment, home)
    assessment = assess(member.profile, snapshot)
    _require_data(assessment)
    return MemberRiskResponse(
        member_id=member.id, member_name=member.profile.name, disclaimer=DISCLAIMER,
        location=snapshot.cell, assessment=assessment,
    )


@router.get("/members/{member_id}/risk/hourly", response_model=MemberHourlyRiskResponse)
async def member_hourly_risk(member: MemberDep, home: HomeDep, environment: EnvironmentDep) -> MemberHourlyRiskResponse:
    snapshot = await _snapshot(environment, home)
    hourly = hourly_assessment(member.profile, snapshot, hours=24)
    if not hourly:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=DATA_UNAVAILABLE)
    return MemberHourlyRiskResponse(
        member_id=member.id,
        member_name=member.profile.name,
        disclaimer=DISCLAIMER,
        timezone=home.timezone,
        hourly=_hourly_items(hourly, home.timezone),
        safe_windows=safe_windows(hourly, home.timezone),
        routines=check_routines(member.profile, member.routines, snapshot, home.timezone),
        warnings=snapshot.warnings,
    )


@router.get("/family/risk", response_model=FamilyRiskResponse)
async def family_risk(members: FamilyDep, home: HomeDep, environment: EnvironmentDep) -> FamilyRiskResponse:
    snapshot = await _snapshot(environment, home)  # one snapshot shared by the whole family
    cards = []
    for member in members:
        assessment = assess(member.profile, snapshot)
        _require_data(assessment)
        windows = safe_windows(hourly_assessment(member.profile, snapshot, hours=24), home.timezone)
        routines = check_routines(member.profile, member.routines, snapshot, home.timezone)
        cards.append(
            FamilyRiskCard(
                member_id=member.id,
                name=member.profile.name,
                age=member.profile.age,
                score=assessment.score,
                level=assessment.level,
                top_factors=assessment.top_factors,
                missing_factors=[m.factor for m in assessment.missing_factors],
                next_safe_window=windows[0] if windows else None,
                unsafe_routines=[r.activity for r in routines if r.status == "unsafe"],
            )
        )
    return FamilyRiskResponse(
        disclaimer=DISCLAIMER,
        generated_at=snapshot.generated_at,
        timezone=home.timezone,
        location=snapshot.cell,
        data_sources={p: s.model_dump(mode="json") for p, s in snapshot.sources.items()},
        warnings=snapshot.warnings,
        members=cards,
    )
