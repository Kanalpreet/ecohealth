"""EnvironmentService: one entry point that combines all providers."""

import asyncio
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any, TypeVar

import httpx

from app.core.config import Settings, get_settings
from app.core.constants import LAT_MAX, LAT_MIN, LON_MAX, LON_MIN
from app.services.environment.errors import ProviderError
from app.services.environment.http import DEFAULT_TIMEOUT, ProviderHttpClient, RetryPolicy
from app.services.environment.models import EnvironmentSnapshot, ProviderFailure, ProviderName
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
_T = TypeVar("_T")


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

    async def get_snapshot(self, latitude: float, longitude: float) -> EnvironmentSnapshot:
        if not (LAT_MIN <= latitude <= LAT_MAX and LON_MIN <= longitude <= LON_MAX):
            raise ValueError("latitude/longitude out of range")

        failures: list[ProviderFailure] = []

        async def guarded(provider: ProviderName, call: Awaitable[_T]) -> _T | None:
            try:
                return await call
            except ProviderError as exc:
                failures.append(ProviderFailure(provider=provider, kind=exc.kind, reason=exc.reason))
            except Exception as exc:  # noqa: BLE001 - a bug in one client must not sink the snapshot
                # Class name only in the record; traceback in the server log (no coordinates).
                logger.exception("Unexpected error in provider %s", provider)
                failures.append(ProviderFailure(provider=provider, kind="error", reason=type(exc).__name__))
            return None

        weather, air_quality, elevation, stations = await asyncio.gather(
            guarded(WEATHER_PROVIDER, self.weather.get_forecast(latitude, longitude)),
            guarded(AIR_QUALITY_PROVIDER, self.air_quality.get_air_quality(latitude, longitude)),
            guarded(ELEVATION_PROVIDER, self.elevation.get_elevation(latitude, longitude)),
            guarded(OPENAQ_PROVIDER, self.openaq.get_nearby_stations(latitude, longitude)),
        )

        warnings: list[str] = []
        for part in (weather, air_quality, stations):
            if part is not None:
                warnings.extend(part.warnings)
        if stations is not None and not stations.stations:
            warnings.append(
                f"{OPENAQ_PROVIDER}: no station with PM data from the last "
                f"{stations.max_age_hours:g} h within {stations.radius_km:g} km"
            )

        order = [WEATHER_PROVIDER, AIR_QUALITY_PROVIDER, ELEVATION_PROVIDER, OPENAQ_PROVIDER]
        failures.sort(key=lambda f: order.index(f.provider))
        return EnvironmentSnapshot(
            latitude=latitude,
            longitude=longitude,
            generated_at=self._clock(),
            weather=weather,
            air_quality=air_quality,
            elevation_m=elevation,
            stations=stations,
            failures=failures,
            warnings=warnings,
        )
