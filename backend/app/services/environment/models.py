"""Provider-independent domain models for environmental data.

Nothing outside app.services.environment should depend on a provider's JSON.
All datetimes are timezone-aware UTC. Concentrations are µg/m³.
"""

from datetime import UTC, date, datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator


class _Domain(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


def _to_utc(value: datetime) -> datetime:
    return value.astimezone(UTC)


class _Timed(_Domain):
    @field_validator("time", "observed_at", "measured_at", "generated_at", check_fields=False)
    @classmethod
    def _utc(cls, value: datetime) -> datetime:
        return _to_utc(value)


# ---- Weather ----


class _WeatherValues(_Timed):
    temperature_c: float | None = None
    apparent_temperature_c: float | None = None
    relative_humidity_pct: float | None = None
    wind_speed_kmh: float | None = None
    wind_direction_deg: float | None = None
    uv_index: float | None = None
    precipitation_mm: float | None = None


class CurrentConditions(_WeatherValues):
    observed_at: AwareDatetime


class HourlyForecastPoint(_WeatherValues):
    time: AwareDatetime


class DailyTemperature(_Domain):
    date: date  # UTC calendar day
    min_c: float | None = None
    max_c: float | None = None


class WeatherForecast(_Domain):
    current: CurrentConditions | None
    hourly: list[HourlyForecastPoint]
    daily: list[DailyTemperature]
    warnings: list[str] = Field(default_factory=list)


# ---- Air quality (model forecast) ----


class AirQualityReading(_Timed):
    time: AwareDatetime
    pm2_5: float | None = None
    pm10: float | None = None
    no2: float | None = None
    o3: float | None = None
    so2: float | None = None
    co: float | None = None


class AirQualityForecast(_Domain):
    current: AirQualityReading | None
    hourly: list[AirQualityReading]  # past day + forecast, in time order
    warnings: list[str] = Field(default_factory=list)


# ---- Ground monitoring stations ----


class StationMeasurement(_Timed):
    value: float  # µg/m³
    measured_at: AwareDatetime
    age_minutes: int
    is_stale: bool


class StationReading(_Domain):
    station_id: int
    name: str
    data_owner: str | None  # original source, e.g. "CPCB" (attribution)
    distance_km: float
    latitude: float
    longitude: float
    pm2_5: StationMeasurement | None = None
    pm10: StationMeasurement | None = None

    @property
    def has_fresh_data(self) -> bool:
        return any(m is not None and not m.is_stale for m in (self.pm2_5, self.pm10))


class StationReport(_Domain):
    stations: list[StationReading]  # nearest first
    ignored_stale_stations: int  # within radius, but no PM reading within max age
    max_age_hours: float
    radius_km: float
    warnings: list[str] = Field(default_factory=list)


# ---- Snapshot ----

FailureKind = Literal["unavailable", "invalid_response", "not_configured", "error"]
ProviderName = Literal["open-meteo-weather", "open-meteo-air-quality", "open-meteo-elevation", "openaq"]


class ProviderFailure(_Domain):
    provider: ProviderName
    kind: FailureKind
    reason: str  # short and safe: no URLs, keys or response bodies


class EnvironmentSnapshot(_Timed):
    latitude: float
    longitude: float
    generated_at: AwareDatetime
    weather: WeatherForecast | None = None
    air_quality: AirQualityForecast | None = None
    elevation_m: float | None = None
    stations: StationReport | None = None
    failures: list[ProviderFailure] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    def failed(self, provider: ProviderName) -> bool:
        return any(f.provider == provider for f in self.failures)
