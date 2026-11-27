"""Open-Meteo clients: weather forecast, air quality, elevation (no API key).

Data licence: CC BY 4.0, attribution "Weather data by Open-Meteo.com".
See docs/environment-data.md for the API contracts.
"""

from datetime import date
from typing import Any, Self, TypeVar

from pydantic import BaseModel, ConfigDict, ValidationError, model_validator

from app.services.environment.errors import ProviderResponseError
from app.services.environment.http import ProviderHttpClient
from app.services.environment.models import (
    AirQualityForecast,
    AirQualityReading,
    CurrentConditions,
    DailyTemperature,
    HourlyForecastPoint,
    WeatherForecast,
)
from app.services.environment.validation import ValueCleaner, naive_utc

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"

WEATHER_PROVIDER = "open-meteo-weather"
AIR_QUALITY_PROVIDER = "open-meteo-air-quality"
ELEVATION_PROVIDER = "open-meteo-elevation"

# Open-Meteo variable -> (domain field, accepted unit strings)
WEATHER_VARIABLES: dict[str, tuple[str, set[str]]] = {
    "temperature_2m": ("temperature_c", {"°C"}),
    "apparent_temperature": ("apparent_temperature_c", {"°C"}),
    "relative_humidity_2m": ("relative_humidity_pct", {"%"}),
    "wind_speed_10m": ("wind_speed_kmh", {"km/h"}),
    "wind_direction_10m": ("wind_direction_deg", {"°"}),
    "uv_index": ("uv_index", {""}),
    "precipitation": ("precipitation_mm", {"mm"}),
}
DAILY_VARIABLES = {"temperature_2m_max": {"°C"}, "temperature_2m_min": {"°C"}}
MICROGRAMS = {"μg/m³", "µg/m³"}  # Greek mu (Open-Meteo) and micro sign (OpenAQ)
AIR_QUALITY_VARIABLES: dict[str, tuple[str, set[str]]] = {
    "pm2_5": ("pm2_5", MICROGRAMS),
    "pm10": ("pm10", MICROGRAMS),
    "nitrogen_dioxide": ("no2", MICROGRAMS),
    "ozone": ("o3", MICROGRAMS),
    "sulphur_dioxide": ("so2", MICROGRAMS),
    "carbon_monoxide": ("co", MICROGRAMS),
}

Number = float | None
_Model = TypeVar("_Model", bound=BaseModel)


# ---------------------------------------------------------------------------
# Provider response models (Open-Meteo's JSON shape). Keys are REQUIRED; values
# may be null. Unknown keys are ignored.
# ---------------------------------------------------------------------------


class _OpenMeteoModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class _Series(_OpenMeteoModel):
    """Column-oriented arrays: every list must have the same length as `time`."""

    @model_validator(mode="after")
    def _same_lengths(self) -> Self:
        lengths = {name: len(getattr(self, name)) for name in type(self).model_fields}
        if len(set(lengths.values())) > 1:
            raise ValueError(f"arrays have different lengths: {lengths}")
        return self


class _WeatherCurrent(_OpenMeteoModel):
    time: str
    temperature_2m: Number
    apparent_temperature: Number
    relative_humidity_2m: Number
    wind_speed_10m: Number
    wind_direction_10m: Number
    uv_index: Number
    precipitation: Number


class _WeatherHourly(_Series):
    time: list[str]
    temperature_2m: list[Number]
    apparent_temperature: list[Number]
    relative_humidity_2m: list[Number]
    wind_speed_10m: list[Number]
    wind_direction_10m: list[Number]
    uv_index: list[Number]
    precipitation: list[Number]


class _WeatherDaily(_Series):
    time: list[date]
    temperature_2m_max: list[Number]
    temperature_2m_min: list[Number]


class _UtcResponse(_OpenMeteoModel):
    utc_offset_seconds: int

    @model_validator(mode="after")
    def _must_be_utc(self) -> Self:
        if self.utc_offset_seconds != 0:
            raise ValueError("response is not in UTC (utc_offset_seconds != 0)")
        return self


class _ForecastResponse(_UtcResponse):
    current_units: dict[str, str]
    current: _WeatherCurrent
    hourly_units: dict[str, str]
    hourly: _WeatherHourly
    daily_units: dict[str, str]
    daily: _WeatherDaily


class _AirQualityCurrent(_OpenMeteoModel):
    time: str
    pm2_5: Number
    pm10: Number
    nitrogen_dioxide: Number
    ozone: Number
    sulphur_dioxide: Number
    carbon_monoxide: Number


class _AirQualityHourly(_Series):
    time: list[str]
    pm2_5: list[Number]
    pm10: list[Number]
    nitrogen_dioxide: list[Number]
    ozone: list[Number]
    sulphur_dioxide: list[Number]
    carbon_monoxide: list[Number]


class _AirQualityResponse(_UtcResponse):
    current_units: dict[str, str]
    current: _AirQualityCurrent
    hourly_units: dict[str, str]
    hourly: _AirQualityHourly


class _ElevationResponse(_OpenMeteoModel):
    elevation: list[Number]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def parse_response(provider: str, model: type[_Model], data: Any) -> _Model:
    """Validate provider JSON; turn failures into a safe ProviderResponseError."""
    try:
        return model.model_validate(data)
    except ValidationError as exc:
        first = exc.errors(include_input=False, include_url=False)[0]
        where = ".".join(str(part) for part in first["loc"]) or "body"
        raise ProviderResponseError(provider, f"invalid response at {where}: {first['msg']}") from None


def check_units(provider: str, units: dict[str, str], expected: dict[str, set[str]], section: str) -> None:
    for variable, accepted in expected.items():
        actual = units.get(variable)
        if actual not in accepted:
            raise ProviderResponseError(
                provider, f"unexpected unit for {section}.{variable}: {actual!r} (expected {sorted(accepted)})"
            )


def _times(provider: str, values: list[str]):
    try:
        return [naive_utc(v) for v in values]
    except ValueError:
        raise ProviderResponseError(provider, "invalid response: unparseable time") from None


def _location_params(latitude: float, longitude: float) -> dict[str, Any]:
    return {"latitude": latitude, "longitude": longitude, "timezone": "GMT"}


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------


class OpenMeteoWeatherClient:
    def __init__(self, http: ProviderHttpClient, forecast_days: int = 5) -> None:
        self._http = http
        self.forecast_days = forecast_days

    async def get_forecast(self, latitude: float, longitude: float) -> WeatherForecast:
        variables = ",".join(WEATHER_VARIABLES)
        params = {
            **_location_params(latitude, longitude),
            "current": variables,
            "hourly": variables,
            "daily": ",".join(DAILY_VARIABLES),
            "forecast_days": self.forecast_days,
            "temperature_unit": "celsius",
            "wind_speed_unit": "kmh",
            "precipitation_unit": "mm",
        }
        data = await self._http.get_json(FORECAST_URL, params=params)
        return self.to_domain(parse_response(WEATHER_PROVIDER, _ForecastResponse, data))

    @staticmethod
    def to_domain(resp: _ForecastResponse) -> WeatherForecast:
        expected = {name: units for name, (_, units) in WEATHER_VARIABLES.items()}
        check_units(WEATHER_PROVIDER, resp.current_units, expected, "current")
        check_units(WEATHER_PROVIDER, resp.hourly_units, expected, "hourly")
        check_units(WEATHER_PROVIDER, resp.daily_units, DAILY_VARIABLES, "daily")
        cleaner = ValueCleaner(WEATHER_PROVIDER)

        def values(source, index: int | None = None) -> dict[str, float | None]:
            out = {}
            for name, (field, _) in WEATHER_VARIABLES.items():
                raw = getattr(source, name)
                out[field] = cleaner.clean(field, raw if index is None else raw[index])
            return out

        current = CurrentConditions(
            observed_at=_times(WEATHER_PROVIDER, [resp.current.time])[0], **values(resp.current)
        )
        hourly = [
            HourlyForecastPoint(time=t, **values(resp.hourly, i))
            for i, t in enumerate(_times(WEATHER_PROVIDER, resp.hourly.time))
        ]
        daily = [
            DailyTemperature(
                date=day,
                min_c=cleaner.clean("temperature_c", resp.daily.temperature_2m_min[i]),
                max_c=cleaner.clean("temperature_c", resp.daily.temperature_2m_max[i]),
            )
            for i, day in enumerate(resp.daily.time)
        ]
        return WeatherForecast(current=current, hourly=hourly, daily=daily, warnings=cleaner.warnings())


class OpenMeteoAirQualityClient:
    def __init__(self, http: ProviderHttpClient, past_days: int = 1, forecast_days: int = 5) -> None:
        self._http = http
        self.past_days = past_days
        self.forecast_days = forecast_days

    async def get_air_quality(self, latitude: float, longitude: float) -> AirQualityForecast:
        variables = ",".join(AIR_QUALITY_VARIABLES)
        params = {
            **_location_params(latitude, longitude),
            "current": variables,
            "hourly": variables,
            "past_days": self.past_days,
            "forecast_days": self.forecast_days,
        }
        data = await self._http.get_json(AIR_QUALITY_URL, params=params)
        return self.to_domain(parse_response(AIR_QUALITY_PROVIDER, _AirQualityResponse, data))

    @staticmethod
    def to_domain(resp: _AirQualityResponse) -> AirQualityForecast:
        expected = {name: units for name, (_, units) in AIR_QUALITY_VARIABLES.items()}
        check_units(AIR_QUALITY_PROVIDER, resp.current_units, expected, "current")
        check_units(AIR_QUALITY_PROVIDER, resp.hourly_units, expected, "hourly")
        cleaner = ValueCleaner(AIR_QUALITY_PROVIDER)

        def values(source, index: int | None = None) -> dict[str, float | None]:
            out = {}
            for name, (field, _) in AIR_QUALITY_VARIABLES.items():
                raw = getattr(source, name)
                out[field] = cleaner.clean(field, raw if index is None else raw[index])
            return out

        current = AirQualityReading(time=_times(AIR_QUALITY_PROVIDER, [resp.current.time])[0], **values(resp.current))
        hourly = [
            AirQualityReading(time=t, **values(resp.hourly, i))
            for i, t in enumerate(_times(AIR_QUALITY_PROVIDER, resp.hourly.time))
        ]
        warnings = cleaner.warnings()
        missing = sum(1 for point in hourly if point.pm2_5 is None)
        if missing:
            warnings.append(f"{AIR_QUALITY_PROVIDER}: {missing} hourly point(s) without PM2.5 (beyond model horizon)")
        return AirQualityForecast(current=current, hourly=hourly, warnings=warnings)


class OpenMeteoElevationClient:
    def __init__(self, http: ProviderHttpClient) -> None:
        self._http = http

    async def get_elevation(self, latitude: float, longitude: float) -> float:
        data = await self._http.get_json(ELEVATION_URL, params={"latitude": latitude, "longitude": longitude})
        resp = parse_response(ELEVATION_PROVIDER, _ElevationResponse, data)
        if not resp.elevation:
            raise ProviderResponseError(ELEVATION_PROVIDER, "invalid response: empty elevation list")
        value = ValueCleaner(ELEVATION_PROVIDER).clean("elevation_m", resp.elevation[0])
        if value is None:
            raise ProviderResponseError(ELEVATION_PROVIDER, "invalid response: missing or implausible elevation")
        return value
