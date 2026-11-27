"""EnvironmentService: one entry point that combines all providers."""

import asyncio
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

import httpx

from app.core.config import Settings, get_settings
from app.core.constants import LAT_MAX, LAT_MIN, LON_MAX, LON_MIN
from app.services.environment.errors import ProviderError
from app.services.environment.http import DEFAULT_TIMEOUT, ProviderHttpClient, RetryPolicy
from app.services.environment.models import (
    AirQualityForecast,
    EnvironmentSnapshot,
    ProviderFailure,
    ProviderName,
    ProviderSource,
    StationReport,
    WeatherForecast,
)
from app.services.environment.open_meteo import (
    AIR_QUALITY_PROVIDER,
    ELEVATION_PROVIDER,
    WEATHER_PROVIDER,
    OpenMeteoAirQualityClient,
    OpenMeteoElevationClient,
    OpenMeteoWeatherClient,
)
from app.services.environment.openaq import OPENAQ_RATE_LIMITER, OpenAQClient
from app.services.environment.openaq import PROVIDER as OPENAQ_PROVIDER

logger = logging.getLogger(__name__)


class EnvironmentService:
    def __init__(
        self,
        weather: OpenMeteoWeatherClient,
        air_quality: OpenMeteoAirQualityClient,
        elevation: OpenMeteoElevationClient,
        openaq: OpenAQClient,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self.weather = weather
        self.air_quality = air_quality
        self.elevation = elevation
        self.openaq = openaq
        self._clock = clock

    @classmethod
    @asynccontextmanager
    async def create(
        cls,
        settings: Settings | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        retry: RetryPolicy = RetryPolicy(),
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> AsyncIterator["EnvironmentService"]:
        """Build a service with one shared httpx.AsyncClient (closed on exit).

        `transport` lets tests inject httpx.MockTransport (no network).
        """
        settings = settings or get_settings()
        async with httpx.AsyncClient(
            timeout=DEFAULT_TIMEOUT, transport=transport, headers={"User-Agent": "EcoHealth/0.1"}
        ) as client:

            def http(provider: str, **kwargs: Any) -> ProviderHttpClient:
                return ProviderHttpClient(provider, client, retry=retry, sleep=sleep, **kwargs)

            yield cls(
                weather=OpenMeteoWeatherClient(http(WEATHER_PROVIDER)),
                air_quality=OpenMeteoAirQualityClient(http(AIR_QUALITY_PROVIDER)),
                elevation=OpenMeteoElevationClient(http(ELEVATION_PROVIDER)),
                openaq=OpenAQClient(
                    http(OPENAQ_PROVIDER, rate_limiter=OPENAQ_RATE_LIMITER),
                    api_key=settings.openaq_api_key,
                    max_age_hours=settings.openaq_max_age_hours,
                    clock=clock,
                ),
                clock=clock,
            )

    async def fetch(self, provider: ProviderName, latitude: float, longitude: float) -> Any:
        """Fetch ONE provider live. Raises ProviderError on failure (used by the cache layer)."""
        if provider == WEATHER_PROVIDER:
            return await self.weather.get_forecast(latitude, longitude)
        if provider == AIR_QUALITY_PROVIDER:
            return await self.air_quality.get_air_quality(latitude, longitude)
        if provider == ELEVATION_PROVIDER:
            return await self.elevation.get_elevation(latitude, longitude)
        if provider == OPENAQ_PROVIDER:
            return await self.openaq.get_nearby_stations(latitude, longitude)
        raise ValueError(f"unknown provider: {provider}")

    async def get_snapshot(self, latitude: float, longitude: float) -> EnvironmentSnapshot:
        check_coordinates(latitude, longitude)
        now = self._clock()
        failures: list[ProviderFailure] = []

        async def guarded(provider: ProviderName) -> Any:
            try:
                return await self.fetch(provider, latitude, longitude)
            except Exception as exc:  # noqa: BLE001 - one provider must not sink the snapshot
                failures.append(failure_from(provider, exc))
                return None

        results = dict(zip(PROVIDER_ORDER, await asyncio.gather(*(guarded(p) for p in PROVIDER_ORDER)), strict=True))
        sources = {
            p: ProviderSource(source="live", fetched_at=now) for p, value in results.items() if value is not None
        }
        failures.sort(key=lambda f: PROVIDER_ORDER.index(f.provider))
        return EnvironmentSnapshot(
            latitude=latitude,
            longitude=longitude,
            generated_at=now,
            weather=results[WEATHER_PROVIDER],
            air_quality=results[AIR_QUALITY_PROVIDER],
            elevation_m=results[ELEVATION_PROVIDER],
            stations=results[OPENAQ_PROVIDER],
            failures=failures,
            warnings=collect_warnings(results[WEATHER_PROVIDER], results[AIR_QUALITY_PROVIDER], results[OPENAQ_PROVIDER]),
            sources=sources,
        )


# ---- Helpers shared with the cache layer ----

PROVIDER_ORDER: list[ProviderName] = [WEATHER_PROVIDER, AIR_QUALITY_PROVIDER, ELEVATION_PROVIDER, OPENAQ_PROVIDER]


def check_coordinates(latitude: float, longitude: float) -> None:
    if not (LAT_MIN <= latitude <= LAT_MAX and LON_MIN <= longitude <= LON_MAX):
        raise ValueError("latitude/longitude out of range")


def failure_from(provider: ProviderName, exc: Exception) -> ProviderFailure:
    if isinstance(exc, ProviderError):
        return ProviderFailure(provider=provider, kind=exc.kind, reason=exc.reason)
    # A bug in one client: class name only in the record; traceback in the log (no coordinates).
    logger.error("Unexpected error in provider %s", provider, exc_info=exc)
    return ProviderFailure(provider=provider, kind="error", reason=type(exc).__name__)


def collect_warnings(
    weather: WeatherForecast | None, air_quality: AirQualityForecast | None, stations: StationReport | None
) -> list[str]:
    warnings: list[str] = []
    for part in (weather, air_quality, stations):
        if part is not None:
            warnings.extend(part.warnings)
    if stations is not None and not stations.stations:
        warnings.append(
            f"{OPENAQ_PROVIDER}: no station with PM data from the last "
            f"{stations.max_age_hours:g} h within {stations.radius_km:g} km"
        )
    return warnings
