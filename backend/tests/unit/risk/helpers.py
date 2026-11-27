"""Synthetic snapshots and profiles for risk engine tests (no network, no DB)."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.services.environment.models import (
    AirQualityForecast,
    AirQualityReading,
    CurrentConditions,
    EnvironmentSnapshot,
    HourlyForecastPoint,
    ProviderFailure,
    ProviderSource,
    WeatherForecast,
)
from app.services.risk import MemberProfile

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "risk"
# Sunday 1 March 2026, 06:00 UTC = 11:30 IST
T0 = datetime(2026, 3, 1, 6, 0, tzinfo=UTC)

HEALTHY = MemberProfile(name="Healthy adult", age=34)
PRIYA = MemberProfile(name="Priya", age=34, conditions=["asthma"])
AARAV = MemberProfile(name="Aarav", age=6)
PAPA = MemberProfile(name="Papa", age=68, conditions=["heart_disease"])

Value = float | None | Callable[[datetime], float | None]


def load_scenario(name: str) -> EnvironmentSnapshot:
    return EnvironmentSnapshot.model_validate_json((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


def _v(value: Value, t: datetime) -> float | None:
    return value(t) if callable(value) else value


def make_snapshot(
    *,
    temperature: Value = 25.0,
    rh: Value = 50.0,
    uv: Value = 0.0,
    pm25: Value = 10.0,
    pm10: Value = 20.0,
    elevation: float | None = 216.0,
    generated_at: datetime = T0,
    past_hours: int = 24,
    future_hours: int = 72,
    weather: bool = True,
    air: bool = True,
    sources: dict[str, str] | None = None,
) -> EnvironmentSnapshot:
    """A snapshot with constant (or time-dependent) values on an hourly UTC grid."""
    start = generated_at.replace(minute=0, second=0, microsecond=0) - timedelta(hours=past_hours)
    times = [start + timedelta(hours=i) for i in range(past_hours + future_hours + 1)]
    failures: list[ProviderFailure] = []

    weather_model = None
    if weather:
        def wx(t: datetime) -> dict:
            return {
                "temperature_c": _v(temperature, t),
                "relative_humidity_pct": _v(rh, t),
                "uv_index": _v(uv, t),
                "wind_speed_kmh": 5.0,
            }

        weather_model = WeatherForecast(
            current=CurrentConditions(observed_at=generated_at, **wx(generated_at)),
            hourly=[HourlyForecastPoint(time=t, **wx(t)) for t in times],
            daily=[],
        )
    else:
        failures.append(ProviderFailure(provider="open-meteo-weather", kind="unavailable", reason="timeout after 3 attempts"))

    air_model = None
    if air:
        air_model = AirQualityForecast(
            current=AirQualityReading(time=generated_at.replace(minute=0), pm2_5=_v(pm25, generated_at), pm10=_v(pm10, generated_at)),
            hourly=[AirQualityReading(time=t, pm2_5=_v(pm25, t), pm10=_v(pm10, t)) for t in times],
        )
    else:
        failures.append(ProviderFailure(provider="open-meteo-air-quality", kind="unavailable", reason="HTTP 503 after 3 attempts"))

    kinds = sources or {}
    source_map = {
        p: ProviderSource(source=kinds.get(p, "live"), fetched_at=generated_at)
        for p, present in (("open-meteo-weather", weather), ("open-meteo-air-quality", air),
                           ("open-meteo-elevation", elevation is not None))
        if present
    }
    return EnvironmentSnapshot(
        latitude=28.6, longitude=77.2, generated_at=generated_at, weather=weather_model, air_quality=air_model,
        elevation_m=elevation, failures=failures, sources=source_map,
    )
