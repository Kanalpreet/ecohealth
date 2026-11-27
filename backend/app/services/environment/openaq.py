"""OpenAQ v3 client: nearby ground monitoring stations and their latest PM readings.

- The API key is sent ONLY in the X-API-Key header (never in URLs or logs).
- Rate limits: 60 requests/min and 2,000/hour per key, enforced locally by a
  shared sliding-window limiter; HTTP 429 is retried by the HTTP layer.
See docs/environment-data.md for the API contract.
"""

import asyncio
import math
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from pydantic import AwareDatetime, BaseModel, ConfigDict, SecretStr

from app.services.environment.errors import ProviderError, ProviderNotConfiguredError
from app.services.environment.http import ProviderHttpClient
from app.services.environment.models import StationMeasurement, StationReading, StationReport
from app.services.environment.open_meteo import MICROGRAMS, parse_response
from app.services.environment.ratelimit import SlidingWindowRateLimiter
from app.services.environment.validation import ValueCleaner

PROVIDER = "openaq"
LOCATIONS_URL = "https://api.openaq.org/v3/locations"
LATEST_URL = "https://api.openaq.org/v3/locations/{location_id}/latest"
MAX_RADIUS_M = 25_000  # OpenAQ maximum
LOCATIONS_PAGE_LIMIT = 100
PM_PARAMETERS = {"pm25": "pm2_5", "pm10": "pm10"}  # OpenAQ parameter name -> domain field

# One limiter per process, shared by every OpenAQClient (the limit is per API key).
OPENAQ_RATE_LIMITER = SlidingWindowRateLimiter(PROVIDER, limits=[(60, 60.0), (2000, 3600.0)])


# ---- Provider response models (OpenAQ JSON shape) ----


class _OpenAQModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class _Parameter(_OpenAQModel):
    id: int
    name: str
    units: str


class _Sensor(_OpenAQModel):
    id: int
    parameter: _Parameter


class _Coordinates(_OpenAQModel):
    latitude: float
    longitude: float


class _When(_OpenAQModel):
    utc: AwareDatetime


class _Named(_OpenAQModel):
    name: str | None = None


class _Location(_OpenAQModel):
    id: int
    name: str | None = None
    provider: _Named | None = None
    sensors: list[_Sensor]
    coordinates: _Coordinates | None = None
    distance: float | None = None  # metres
    datetimeLast: _When | None = None  # noqa: N815 (OpenAQ field name)


class _LocationsResponse(_OpenAQModel):
    results: list[_Location]


class _Latest(_OpenAQModel):
    datetime: _When
    value: float | None
    sensorsId: int  # noqa: N815


class _LatestResponse(_OpenAQModel):
    results: list[_Latest]


# ---- Helpers ----


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


_UNKNOWN_NAMES = {"", "n/a", "na", "unknown", "none"}


def _data_owner(location: _Location) -> str | None:
    name = (location.provider.name or "").strip() if location.provider else ""
    return None if name.lower() in _UNKNOWN_NAMES else name


def _pm_sensors(location: _Location) -> dict[int, str]:
    """sensor id -> domain field, for PM2.5/PM10 sensors reporting µg/m³."""
    return {
        s.id: PM_PARAMETERS[s.parameter.name]
        for s in location.sensors
        if s.parameter.name in PM_PARAMETERS and s.parameter.units in MICROGRAMS
    }


# ---- Client ----


class OpenAQClient:
    def __init__(
        self,
        http: ProviderHttpClient,
        api_key: SecretStr | None,
        max_age_hours: float = 3.0,
        max_stations: int = 5,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._http = http
        self._api_key = api_key
        self.max_age = timedelta(hours=max_age_hours)
        self.max_stations = max_stations
        self._clock = clock

    def _headers(self) -> dict[str, str]:
        if self._api_key is None or not self._api_key.get_secret_value():
            raise ProviderNotConfiguredError(PROVIDER, "OPENAQ_API_KEY is not set")
        return {"X-API-Key": self._api_key.get_secret_value(), "Accept": "application/json"}

    async def get_nearby_stations(
        self, latitude: float, longitude: float, radius_m: int = MAX_RADIUS_M
    ) -> StationReport:
        if not 0 < radius_m <= MAX_RADIUS_M:
            raise ValueError(f"radius_m must be between 1 and {MAX_RADIUS_M}")
        headers = self._headers()  # fails fast, before any request, if no key
        now = self._clock()

        data = await self._http.get_json(
            LOCATIONS_URL,
            params={"coordinates": f"{latitude},{longitude}", "radius": radius_m, "limit": LOCATIONS_PAGE_LIMIT},
            headers=headers,
        )
        locations = parse_response(PROVIDER, _LocationsResponse, data).results

        candidates: list[tuple[float, _Location, dict[int, str]]] = []
        ignored_stale = 0
        for location in locations:
            sensors = _pm_sensors(location)
            if not sensors or location.coordinates is None:
                continue  # no PM sensor: irrelevant for this report
            last = location.datetimeLast.utc if location.datetimeLast else None
            if last is None or now - last > self.max_age:
                ignored_stale += 1  # e.g. stations that stopped reporting years ago
                continue
            distance_km = (
                location.distance / 1000
                if location.distance is not None
                else haversine_km(latitude, longitude, location.coordinates.latitude, location.coordinates.longitude)
            )
            candidates.append((distance_km, location, sensors))

        candidates.sort(key=lambda item: item[0])
        nearest = candidates[: self.max_stations]
        results = await asyncio.gather(
            *(self._latest(location.id, headers) for _, location, _ in nearest), return_exceptions=True
        )

        stations: list[StationReading] = []
        warnings: list[str] = []
        cleaner = ValueCleaner(PROVIDER)
        dropped_old = 0
        for (distance_km, location, sensors), result in zip(nearest, results, strict=True):
            if isinstance(result, ProviderError):
                warnings.append(f"{PROVIDER}: latest readings unavailable for station {location.id} ({result.reason})")
                continue
            if isinstance(result, BaseException):
                raise result
            measurements, dropped = self._measurements(result, sensors, now, cleaner)
            dropped_old += dropped
            if not measurements:
                ignored_stale += 1
                continue
            stations.append(
                StationReading(
                    station_id=location.id,
                    name=location.name or f"Station {location.id}",
                    data_owner=_data_owner(location),
                    distance_km=round(distance_km, 2),
                    latitude=location.coordinates.latitude,
                    longitude=location.coordinates.longitude,
                    **measurements,
                )
            )

        max_age_hours = self.max_age.total_seconds() / 3600
        if dropped_old:
            warnings.append(
                f"{PROVIDER}: {dropped_old} sensor reading(s) older than {max_age_hours:g} h dropped"
            )
        return StationReport(
            stations=stations,
            ignored_stale_stations=ignored_stale,
            max_age_hours=max_age_hours,
            radius_km=radius_m / 1000,
            warnings=warnings + cleaner.warnings(),
        )

    async def _latest(self, location_id: int, headers: dict[str, str]) -> list[_Latest]:
        data = await self._http.get_json(LATEST_URL.format(location_id=location_id), headers=headers)
        return parse_response(PROVIDER, _LatestResponse, data).results

    def _measurements(
        self, readings: list[_Latest], sensors: dict[int, str], now: datetime, cleaner: ValueCleaner
    ) -> tuple[dict[str, StationMeasurement], int]:
        """Fresh PM measurements per field, and how many old readings were dropped."""
        best: dict[str, _Latest] = {}
        for reading in readings:
            field = sensors.get(reading.sensorsId)
            if field is None:
                continue
            if field not in best or reading.datetime.utc > best[field].datetime.utc:
                best[field] = reading

        out: dict[str, StationMeasurement] = {}
        dropped = 0
        for field, reading in best.items():
            measured_at = reading.datetime.utc
            age = now - measured_at
            if age > self.max_age:
                # Drop old readings even if the station has other fresh sensors
                # (e.g. a PM10 sensor that last reported years ago).
                dropped += 1
                continue
            value = cleaner.clean(field, reading.value)
            if value is None:
                continue
            out[field] = StationMeasurement(
                value=value,
                measured_at=measured_at,
                age_minutes=max(0, int(age.total_seconds() // 60)),
                is_stale=False,  # fresh by construction; cached copies are re-aged on read
            )
        return out, dropped
