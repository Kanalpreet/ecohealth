"""EnvironmentService: combining providers, partial failures, missing key."""

import asyncio

import httpx
import pytest
from pydantic import SecretStr

from app.core.config import Settings
from app.services.environment import EnvironmentService
from tests.unit.environment.conftest import FAKE_KEY, NOW, FakeSleep, Recorder, load, run, sequence

pytestmark = pytest.mark.unit

OPENAQ_HOST = "api.openaq.org"


def all_routes(**overrides):
    routes = {
        "/v1/forecast": load("openmeteo_forecast"),
        "/v1/air-quality": load("openmeteo_air_quality"),
        "/v1/elevation": load("openmeteo_elevation"),
        "/v3/locations": load("openaq_locations"),
        "/v3/locations/17/latest": load("openaq_latest_17"),
        "/v3/locations/50/latest": load("openaq_latest_50"),
    }
    routes.update(overrides)
    return routes


def settings(key: str | None = FAKE_KEY) -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://u:p@localhost:5432/db",
        openaq_api_key=SecretStr(key) if key else None,
    )


async def _snapshot(handler, key=FAKE_KEY, lat=28.61, lon=77.21):
    async with EnvironmentService.create(
        settings=settings(key), transport=httpx.MockTransport(handler), sleep=FakeSleep(), clock=lambda: NOW
    ) as service:
        return await service.get_snapshot(lat, lon)


def snapshot(handler, **kwargs):
    return run(_snapshot(handler, **kwargs))


def test_all_providers_succeed(fresh_limiter):
    snap = snapshot(Recorder(all_routes()))
    assert snap.failures == []
    assert snap.generated_at == NOW
    assert snap.weather.current.temperature_c == 23.5
    assert snap.air_quality.current.pm2_5 == 72.6
    assert snap.elevation_m == 217.0
    assert [s.station_id for s in snap.stations.stations] == [17, 50]
    assert any("without PM2.5" in w for w in snap.warnings)  # provider warnings are collected


def test_one_provider_failing_returns_the_rest(fresh_limiter):
    snap = snapshot(Recorder(all_routes(**{"/v1/air-quality": sequence(httpx.Response(503))})))
    assert snap.air_quality is None
    assert [(f.provider, f.kind, f.reason) for f in snap.failures] == [
        ("open-meteo-air-quality", "unavailable", "HTTP 503 after 3 attempts")
    ]
    assert snap.weather is not None and snap.elevation_m == 217.0 and snap.stations is not None
    assert snap.failed("open-meteo-air-quality") and not snap.failed("open-meteo-weather")


def test_invalid_response_is_recorded_as_invalid_response(fresh_limiter):
    bad = load("openmeteo_forecast")
    bad["utc_offset_seconds"] = 3600
    snap = snapshot(Recorder(all_routes(**{"/v1/forecast": bad})))
    (failure,) = snap.failures
    assert (failure.provider, failure.kind) == ("open-meteo-weather", "invalid_response")
    assert snap.weather is None and snap.air_quality is not None


def test_missing_openaq_key_skips_openaq_only(fresh_limiter):
    rec = Recorder(all_routes())
    snap = snapshot(rec, key=None)
    assert [(f.provider, f.kind, f.reason) for f in snap.failures] == [
        ("openaq", "not_configured", "OPENAQ_API_KEY is not set")
    ]
    assert snap.stations is None
    assert snap.weather is not None and snap.air_quality is not None and snap.elevation_m == 217.0
    assert all(r.url.host != OPENAQ_HOST for r in rec.requests)


def test_unexpected_bug_in_one_client_is_contained(fresh_limiter, monkeypatch):
    async def broken(self, latitude, longitude):
        raise KeyError("surprise")

    monkeypatch.setattr("app.services.environment.open_meteo.OpenMeteoElevationClient.get_elevation", broken)
    snap = snapshot(Recorder(all_routes()))
    (failure,) = snap.failures
    assert (failure.provider, failure.kind, failure.reason) == ("open-meteo-elevation", "error", "KeyError")
    assert snap.weather is not None


def test_every_provider_failing_still_returns_a_snapshot(fresh_limiter):
    snap = snapshot(lambda request: httpx.Response(500), key=None)
    assert {f.provider for f in snap.failures} == {
        "open-meteo-weather", "open-meteo-air-quality", "open-meteo-elevation", "openaq",
    }
    assert snap.weather is None and snap.air_quality is None and snap.elevation_m is None


def test_providers_are_called_concurrently(fresh_limiter):
    in_flight = 0
    peak = 0
    data = all_routes()

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        for _ in range(5):
            await asyncio.sleep(0)  # let the other requests start
        in_flight -= 1
        body = data.get(request.url.path)
        return httpx.Response(200, json=body) if body is not None else httpx.Response(404)

    snapshot(handler)
    assert peak >= 3


@pytest.mark.parametrize(("lat", "lon"), [(91, 0), (0, 181), (-90.5, 10)])
def test_invalid_coordinates_are_rejected(lat, lon):
    with pytest.raises(ValueError):
        snapshot(Recorder(all_routes()), lat=lat, lon=lon)


def test_snapshot_serialises_without_secrets(fresh_limiter):
    snap = snapshot(Recorder(all_routes()))
    text = snap.model_dump_json()
    assert FAKE_KEY not in text
    assert '"generated_at":"2026-11-27T08:20:00Z"' in text  # UTC on the wire


@pytest.fixture
def fresh_limiter(monkeypatch):
    """Give each test its own OpenAQ limiter so tests never hit the shared 60/min cap."""
    from app.services.environment import ratelimit, service

    limiter = ratelimit.SlidingWindowRateLimiter("openaq", [(60, 60.0), (2000, 3600.0)])
    monkeypatch.setattr(service, "OPENAQ_RATE_LIMITER", limiter)
    return limiter
