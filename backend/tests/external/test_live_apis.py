"""Live smoke tests: one real call per API for Delhi.

Run:  .\\.venv\\Scripts\\python.exe -m pytest -m external -v
Skipped automatically when the API host is unreachable (offline) or, for
OpenAQ, when OPENAQ_API_KEY is not configured. The key is never printed.
"""

import asyncio
import socket
from datetime import UTC, datetime, timedelta

import pytest

from app.core.config import ConfigurationError, Settings, get_settings
from app.services.environment import EnvironmentService

pytestmark = pytest.mark.external

DELHI = (28.61, 77.21)


def require_host(host: str) -> None:
    try:
        socket.create_connection((host, 443), timeout=5).close()
    except OSError as exc:
        pytest.skip(f"{host} unreachable ({type(exc).__name__}); offline?")


def load_settings() -> Settings:
    get_settings.cache_clear()
    try:
        return get_settings()
    except ConfigurationError:
        pytest.skip("backend/.env is not configured")


def call(coro_factory):
    async def runner():
        async with EnvironmentService.create(settings=load_settings()) as service:
            return await coro_factory(service)

    return asyncio.run(runner())


def test_open_meteo_weather_live():
    require_host("api.open-meteo.com")
    forecast = call(lambda s: s.weather.get_forecast(*DELHI))
    now = datetime.now(UTC)
    assert abs(forecast.current.observed_at - now) < timedelta(hours=2)
    assert len(forecast.hourly) == 120  # 5 days
    assert len(forecast.daily) == 5
    assert forecast.current.temperature_c is not None


def test_open_meteo_air_quality_live():
    require_host("air-quality-api.open-meteo.com")
    aq = call(lambda s: s.air_quality.get_air_quality(*DELHI))
    assert len(aq.hourly) == 144  # past day + 5 forecast days
    assert aq.current.pm2_5 is not None and aq.current.pm10 is not None


def test_open_meteo_elevation_live():
    require_host("api.open-meteo.com")
    elevation = call(lambda s: s.elevation.get_elevation(*DELHI))
    assert 150 <= elevation <= 300  # Delhi is ~215 m above sea level


def test_openaq_live():
    settings = load_settings()
    if settings.openaq_api_key is None:
        pytest.skip("OPENAQ_API_KEY not configured")
    require_host("api.openaq.org")
    report = call(lambda s: s.openaq.get_nearby_stations(*DELHI))
    assert report.radius_km == 25.0
    distances = [s.distance_km for s in report.stations]
    assert distances == sorted(distances) and all(d <= 25 for d in distances)
    assert all(s.has_fresh_data for s in report.stations)
