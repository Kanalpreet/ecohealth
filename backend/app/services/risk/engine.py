"""Climate Health Risk Engine: assess(), hourly_assessment(), safe_windows(), check_routines().

Deterministic: depends only on its arguments (no clock, no network, no LLM).
See docs/risk-engine.md.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from statistics import fmean
from typing import Any, Literal
from zoneinfo import ZoneInfo

from app.core.constants import WEEKDAYS
from app.services.environment.models import (
    AirQualityReading,
    EnvironmentSnapshot,
    HourlyForecastPoint,
)
from app.services.risk import factors as fx
from app.services.risk import risk_config as cfg
from app.services.risk.models import (
    Context,
    DataSource,
    FactorResult,
    HourlyRisk,
    MemberProfile,
    MissingFactor,
    RiskAssessment,
    RoutineCheck,
    RoutineInput,
    SafeWindow,
)
from app.services.risk.risk_config import FactorName, LevelName

AqiMode = Literal["24h_mean", "hourly"]
ONE_HOUR = timedelta(hours=1)


# ---------------------------------------------------------------------------
# Reading environmental values at a point in time
# ---------------------------------------------------------------------------


def _hour_floor(dt: datetime) -> datetime:
    return dt.astimezone(UTC).replace(minute=0, second=0, microsecond=0)


@dataclass
class _Point:
    subscores: dict[FactorName, float] = field(default_factory=dict)
    values: dict[FactorName, float] = field(default_factory=dict)
    inputs: dict[str, float | str | None] = field(default_factory=dict)
    missing: list[MissingFactor] = field(default_factory=list)
    not_applied: list[MissingFactor] = field(default_factory=list)


def _failure_reason(snapshot: EnvironmentSnapshot, provider: str, fallback: str) -> str:
    for failure in snapshot.failures:
        if failure.provider == provider:
            return f"{provider} unavailable ({failure.kind}: {failure.reason})"
    return fallback


def _weather_at(snapshot: EnvironmentSnapshot, at: datetime) -> tuple[Any, str] | None:
    """Current conditions if at_time is close to them, else the hourly point for that hour."""
    w = snapshot.weather
    if w is None:
        return None
    tolerance = timedelta(minutes=cfg.CURRENT_OBSERVATION_TOLERANCE_MINUTES)
    if w.current is not None and abs(at - w.current.observed_at) <= tolerance:
        return w.current, "current"
    hour = _hour_floor(at)
    point = next((p for p in w.hourly if p.time == hour), None)
    return (point, "hourly") if point is not None else None


def _hourly_series(points: Sequence[HourlyForecastPoint], start: datetime, hours: int) -> list[float]:
    end = start + timedelta(hours=hours)
    return [p.temperature_c for p in points if start <= p.time < end and p.temperature_c is not None]


def _aq_point(snapshot: EnvironmentSnapshot, at: datetime) -> AirQualityReading | None:
    aq = snapshot.air_quality
    if aq is None:
        return None
    hour = _hour_floor(at)
    return next((p for p in aq.hourly if p.time == hour), None)


def _pm_values(snapshot: EnvironmentSnapshot, at: datetime, mode: AqiMode) -> tuple[float | None, float | None, str]:
    """(pm2_5, pm10, basis). 24 h mean per CPCB when enough hours exist, else the hourly value."""
    aq = snapshot.air_quality
    if aq is None:
        return None, None, "missing"
    if mode == "24h_mean":
        window_start = at - timedelta(hours=cfg.AQI_AVERAGING_HOURS)
        window = [p for p in aq.hourly if window_start < p.time <= at]
        pm25 = [p.pm2_5 for p in window if p.pm2_5 is not None]
        pm10 = [p.pm10 for p in window if p.pm10 is not None]
        if len(pm25) >= cfg.AQI_MIN_HOURS_FOR_24H_MEAN or len(pm10) >= cfg.AQI_MIN_HOURS_FOR_24H_MEAN:
            mean25 = fmean(pm25) if len(pm25) >= cfg.AQI_MIN_HOURS_FOR_24H_MEAN else None
            mean10 = fmean(pm10) if len(pm10) >= cfg.AQI_MIN_HOURS_FOR_24H_MEAN else None
            return mean25, mean10, "24h_mean"
    point = _aq_point(snapshot, at)
    if point is None:
        return None, None, "missing"
    return point.pm2_5, point.pm10, "hourly_indicative"


def _point_inputs(snapshot: EnvironmentSnapshot, at: datetime, mode: AqiMode, context: Context) -> _Point:
    pt = _Point()

    # ---- air quality ----
    pm25, pm10, basis = _pm_values(snapshot, at, mode)
    aqi = fx.cpcb_aqi(pm25, pm10)
    if aqi is None:
        reason = _failure_reason(snapshot, "open-meteo-air-quality", "no PM2.5/PM10 data for this time")
        pt.missing.append(MissingFactor(factor="air_quality", reason=reason))
    else:
        value, dominant = aqi
        pt.subscores["air_quality"] = fx.air_subscore(value)
        pt.values["air_quality"] = round(value, 1)
        pt.inputs.update(
            pm2_5=None if pm25 is None else round(pm25, 1),
            pm10=None if pm10 is None else round(pm10, 1),
            aqi=round(value, 1),
            aqi_category=fx.aqi_category(value),
            aqi_dominant=dominant,
            aqi_basis=basis,
        )

    # ---- weather: heat, cold, uv, swing ----
    weather = _weather_at(snapshot, at)
    if weather is None:
        reason = _failure_reason(snapshot, "open-meteo-weather", "no weather data for this time")
        for factor in ("heat", "cold", "uv", "temperature_swing"):
            pt.missing.append(MissingFactor(factor=factor, reason=reason))
    else:
        point, basis_w = weather
        pt.inputs["weather_basis"] = basis_w
        t = point.temperature_c
        rh = point.relative_humidity_pct
        if t is None:
            for factor in ("heat", "cold"):
                pt.missing.append(MissingFactor(factor=factor, reason="temperature missing"))
        else:
            metric, heat_basis = fx.heat_metric_c(t, rh)
            pt.subscores["heat"] = fx.heat_subscore(metric)
            pt.values["heat"] = round(metric, 1)
            pt.subscores["cold"] = fx.cold_subscore(t)
            pt.values["cold"] = t
            pt.inputs.update(
                temperature_c=t,
                relative_humidity_pct=rh,
                heat_metric_c=round(metric, 1),
                heat_basis=heat_basis,
            )
        if point.uv_index is None:
            pt.missing.append(MissingFactor(factor="uv", reason="UV index missing"))
        else:
            pt.subscores["uv"] = fx.uv_subscore(point.uv_index)
            pt.values["uv"] = point.uv_index
            pt.inputs["uv_index"] = point.uv_index

        series = _hourly_series(snapshot.weather.hourly, _hour_floor(at), cfg.SWING_WINDOW_HOURS)
        if len(series) < cfg.SWING_WINDOW_HOURS * 3 // 4:  # need most of the window
            pt.missing.append(MissingFactor(factor="temperature_swing", reason="not enough forecast hours"))
        else:
            swing = max(series) - min(series)
            pt.subscores["temperature_swing"] = fx.swing_subscore(swing)
            pt.values["temperature_swing"] = round(swing, 1)
            pt.inputs["temperature_swing_c"] = round(swing, 1)

    # ---- altitude (travel context only) ----
    if snapshot.elevation_m is None:
        if context == "travel":
            reason = _failure_reason(snapshot, "open-meteo-elevation", "elevation missing")
            pt.missing.append(MissingFactor(factor="altitude", reason=reason))
    else:
        pt.inputs["elevation_m"] = snapshot.elevation_m
        if context == "travel":
            pt.subscores["altitude"] = fx.altitude_subscore(snapshot.elevation_m)
            pt.values["altitude"] = snapshot.elevation_m
        else:
            pt.not_applied.append(
                MissingFactor(factor="altitude", reason="altitude is applied in travel context only")
            )
    return pt


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


@dataclass
class _Scored:
    score: int
    level: LevelName
    factors: list[FactorResult]
    contributions: dict[FactorName, float]
    top: list[FactorName]
    multipliers: dict[FactorName, float]
    unknown: list[str]
    age_mod: float


def _score(member: MemberProfile, point: _Point) -> _Scored:
    multipliers, unknown = fx.condition_multipliers(member.conditions)
    age_mod = fx.age_modifier(member.age)
    score, weights, contributions = fx.combine(point.subscores, multipliers, age_mod, member.sensitivity)
    ordered = [f for f in cfg.FACTORS if f in point.subscores]
    results = [
        FactorResult(
            factor=f,
            value=point.values[f],
            sub_score=round(point.subscores[f], 4),
            weight=round(weights[f], 4),
            contribution_pct=round(contributions[f], 2),
        )
        for f in ordered
    ]
    top = [f for f in sorted(ordered, key=lambda f: -contributions[f]) if contributions[f] > 0][: cfg.TOP_FACTORS]
    return _Scored(score, fx.level_for(score), results, contributions, top, multipliers, unknown, age_mod)


def _data_sources(snapshot: EnvironmentSnapshot) -> tuple[dict[str, DataSource], list[str], list[str]]:
    sources = {p: DataSource(source=s.source, fetched_at=s.fetched_at) for p, s in snapshot.sources.items()}
    stale = sorted(p for p, s in snapshot.sources.items() if s.source == "stale")
    warnings = [f"{p}: using stale data fetched at {snapshot.sources[p].fetched_at:%Y-%m-%d %H:%M} UTC" for p in stale]
    return sources, stale, warnings


def assess(
    member: MemberProfile | Any,
    snapshot: EnvironmentSnapshot,
    at_time: datetime | None = None,
    context: Context = "home",
) -> RiskAssessment:
    """Risk for one member at one time (default: when the snapshot was generated)."""
    profile = member if isinstance(member, MemberProfile) else MemberProfile.model_validate(member)
    at = (at_time or snapshot.generated_at).astimezone(UTC)
    point = _point_inputs(snapshot, at, mode="24h_mean", context=context)
    scored = _score(profile, point)
    sources, stale, warnings = _data_sources(snapshot)
    if scored.unknown:
        warnings.append(f"unknown condition code(s) ignored: {', '.join(scored.unknown)}")
    if point.inputs.get("aqi_basis") == "hourly_indicative":
        warnings.append("air quality: fewer than 16 hourly values for a 24-h mean; hourly value used (indicative)")
    return RiskAssessment(
        engine_version=cfg.ENGINE_VERSION,
        context=context,
        at_time=at,
        score=scored.score,
        level=scored.level,
        factors=scored.factors,
        contributions={f: round(v, 2) for f, v in scored.contributions.items()},
        top_factors=scored.top,
        inputs=point.inputs,
        missing_factors=point.missing,
        not_applied=point.not_applied,
        age_modifier=scored.age_mod,
        sensitivity=profile.sensitivity,
        condition_multipliers={f: m for f, m in scored.multipliers.items() if m != 1.0},
        unknown_conditions=scored.unknown,
        data_sources=sources,
        stale_providers=stale,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Forecast and safe windows
# ---------------------------------------------------------------------------


def _hourly_risk(profile: MemberProfile, snapshot: EnvironmentSnapshot, hour: datetime, context: Context) -> HourlyRisk:
    point = _point_inputs(snapshot, hour, mode="hourly", context=context)
    scored = _score(profile, point)
    return HourlyRisk(
        time=hour,
        score=scored.score,
        level=scored.level,
        top_factors=scored.top,
        missing_factors=[m.factor for m in point.missing],
    )


def _has_forecast(snapshot: EnvironmentSnapshot, hour: datetime) -> bool:
    weather = snapshot.weather is not None and any(p.time == hour for p in snapshot.weather.hourly)
    air = snapshot.air_quality is not None and any(
        p.time == hour and (p.pm2_5 is not None or p.pm10 is not None) for p in snapshot.air_quality.hourly
    )
    return weather or air


def hourly_assessment(
    member: MemberProfile | Any,
    snapshot: EnvironmentSnapshot,
    hours: int = cfg.DEFAULT_FORECAST_HOURS,
    start: datetime | None = None,
    context: Context = "home",
) -> list[HourlyRisk]:
    """One score per forecast hour, from the next full hour after `start` (default: snapshot time)."""
    profile = member if isinstance(member, MemberProfile) else MemberProfile.model_validate(member)
    first = _hour_floor(start or snapshot.generated_at) + ONE_HOUR
    out = []
    for i in range(hours):
        hour = first + i * ONE_HOUR
        if _has_forecast(snapshot, hour):
            out.append(_hourly_risk(profile, snapshot, hour, context))
    return out


def safe_windows(
    hourly: Iterable[HourlyRisk],
    timezone: str,
    below: LevelName = cfg.DEFAULT_SAFE_BELOW,
    hours: int = cfg.DEFAULT_SAFE_WINDOW_HOURS,
) -> list[SafeWindow]:
    """Contiguous hours whose level is below `below`, within the first `hours` forecast hours."""
    tz = ZoneInfo(timezone)
    limit = fx.level_index(below)
    points = sorted(hourly, key=lambda h: h.time)
    if points:
        horizon = points[0].time + timedelta(hours=hours)
        points = [p for p in points if p.time < horizon]

    windows: list[SafeWindow] = []
    run: list[HourlyRisk] = []

    def close() -> None:
        if run:
            start, end = run[0].time, run[-1].time + ONE_HOUR
            worst = max((p.level for p in run), key=fx.level_index)
            windows.append(
                SafeWindow(
                    start=start, end=end, start_local=start.astimezone(tz), end_local=end.astimezone(tz),
                    timezone=timezone, hours=len(run), worst_level=worst,
                )
            )
            run.clear()

    for p in points:
        contiguous = not run or p.time == run[-1].time + ONE_HOUR
        if fx.level_index(p.level) < limit and contiguous:
            run.append(p)
        elif fx.level_index(p.level) < limit:
            close()
            run.append(p)
        else:
            close()
    close()
    return windows


# ---------------------------------------------------------------------------
# Routines
# ---------------------------------------------------------------------------


def next_occurrence(routine: RoutineInput, after: datetime, timezone: str) -> datetime | None:
    """Next local start of the routine strictly after `after` (aware), within 7 days."""
    tz = ZoneInfo(timezone)
    local_now = after.astimezone(tz)
    for day in range(8):
        date = (local_now + timedelta(days=day)).date()
        if WEEKDAYS[date.weekday()] not in routine.days_of_week:
            continue
        candidate = datetime.combine(date, routine.start_time, tzinfo=tz)
        if candidate > local_now:
            return candidate
    return None


def check_routines(
    member: MemberProfile | Any,
    routines: Iterable[RoutineInput | Any],
    snapshot: EnvironmentSnapshot,
    user_timezone: str,
    unsafe_from: LevelName = cfg.DEFAULT_SAFE_BELOW,
    after: datetime | None = None,
    context: Context = "home",
) -> list[RoutineCheck]:
    """Each routine's next occurrence with its expected level; unsafe if level >= `unsafe_from`."""
    profile = member if isinstance(member, MemberProfile) else MemberProfile.model_validate(member)
    reference = (after or snapshot.generated_at).astimezone(UTC)
    limit = fx.level_index(unsafe_from)
    checks = []
    for raw in routines:
        routine = raw if isinstance(raw, RoutineInput) else RoutineInput.model_validate(raw)
        local = next_occurrence(routine, reference, user_timezone)
        base = {"activity": routine.activity, "start_time": routine.start_time, "days_of_week": routine.days_of_week}
        hour = _hour_floor(local) if local is not None else None
        if hour is None or not _has_forecast(snapshot, hour):
            checks.append(RoutineCheck(**base, status="no_forecast", next_occurrence_local=local,
                                       next_occurrence_utc=None if local is None else local.astimezone(UTC),
                                       score=None, level=None, top_factors=[]))
            continue
        risk = _hourly_risk(profile, snapshot, hour, context)
        status = "unsafe" if fx.level_index(risk.level) >= limit else "ok"
        checks.append(RoutineCheck(**base, status=status, next_occurrence_local=local,
                                   next_occurrence_utc=local.astimezone(UTC), score=risk.score,
                                   level=risk.level, top_factors=risk.top_factors))
    return checks
