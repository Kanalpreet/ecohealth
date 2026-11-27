"""CachedEnvironmentService with a fake clock, fake store and fake provider service."""

import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from app.core.config import Settings
from app.core.logging import configure_logging
from app.services.environment.cache import (
    CacheEntry,
    CachedEnvironmentService,
    CachePolicy,
    Cell,
    decode,
    encode,
    to_cell,
)
from app.services.environment.errors import ProviderUnavailableError
from app.services.environment.models import (
    AirQualityForecast,
    StationMeasurement,
    StationReading,
    StationReport,
    WeatherForecast,
)
from app.services.environment.open_meteo import OpenMeteoAirQualityClient, OpenMeteoWeatherClient, _AirQualityResponse, _ForecastResponse, parse_response
from tests.unit.environment.conftest import load, run

pytestmark = pytest.mark.unit

T0 = datetime(2026, 11, 27, 8, 0, tzinfo=UTC)
W, AQ, EL, OA = "open-meteo-weather", "open-meteo-air-quality", "open-meteo-elevation", "openaq"
ALL = (W, AQ, EL, OA)
DELHI = (28.61, 77.21)


# ---- fakes ----


class FakeClock:
    def __init__(self, now: datetime = T0) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kwargs) -> None:
        self.now += timedelta(**kwargs)


class FakeStore:
    def __init__(self) -> None:
        self.rows: dict[tuple[str, Decimal, Decimal], CacheEntry] = {}
        self.fail_get = False
        self.fail_put = False
        self.cleanup_calls: list[tuple[datetime, timedelta]] = []

    async def get(self, provider: str, cell: Cell) -> CacheEntry | None:
        if self.fail_get:
            raise ConnectionError("db down")
        return self.rows.get((provider, cell.lat, cell.lon))

    async def put(self, provider: str, cell: Cell, entry: CacheEntry) -> None:
        if self.fail_put:
            raise ConnectionError("db down")
        self.rows[(provider, cell.lat, cell.lon)] = entry

    async def cleanup(self, now: datetime, max_stale: timedelta) -> int:
        self.cleanup_calls.append((now, max_stale))
        return 7


def station_report(measured_at: datetime) -> StationReport:
    m = StationMeasurement(value=80.0, measured_at=measured_at, age_minutes=0, is_stale=False)
    station = StationReading(
        station_id=1, name="Test Station", data_owner="CPCB", distance_km=1.2, latitude=28.6, longitude=77.2, pm2_5=m
    )
    return StationReport(stations=[station], ignored_stale_stations=0, max_age_hours=3.0, radius_km=25.0)


class FakeService:
    """Stands in for EnvironmentService.fetch; counts calls, can fail per provider."""

    def __init__(self, clock: FakeClock) -> None:
        self.clock = clock
        self.calls: list[tuple[str, float, float]] = []
        self.failing: dict[str, Exception] = {}

    async def fetch(self, provider, latitude, longitude):
        self.calls.append((provider, latitude, longitude))
        if provider in self.failing:
            raise self.failing[provider]
        return {
            W: WeatherForecast(current=None, hourly=[], daily=[]),
            AQ: AirQualityForecast(current=None, hourly=[]),
            EL: 217.0,
            OA: station_report(self.clock.now),
        }[provider]

    def count(self, provider: str) -> int:
        return sum(1 for p, *_ in self.calls if p == provider)


POLICY = CachePolicy(
    grid_degrees=0.05,
    ttls={W: timedelta(minutes=30), AQ: timedelta(minutes=30), OA: timedelta(minutes=30), EL: timedelta(days=30)},
    max_stale=timedelta(hours=6),
)


@pytest.fixture
def env():
    clock = FakeClock()
    service = FakeService(clock)
    store = FakeStore()
    cached = CachedEnvironmentService(service, store, POLICY, clock=clock)
    return cached, service, store, clock


def snap(cached, lat=DELHI[0], lon=DELHI[1]):
    return run(cached.get_snapshot(lat, lon))


def sources(snapshot) -> dict[str, str]:
    return {p: s.source for p, s in snapshot.sources.items()}


# ---- miss, hit, expiry ----


def test_miss_fetches_live_and_stores_every_provider(env):
    cached, service, store, _ = env
    s = snap(cached)
    assert sources(s) == {p: "live" for p in ALL}
    assert s.failures == []
    assert len(store.rows) == 4
    weather_entry = store.rows[("weather", Decimal("28.6000"), Decimal("77.2000"))]
    assert weather_entry.fetched_at == T0 and weather_entry.expires_at == T0 + timedelta(minutes=30)
    assert store.rows[("elevation", Decimal("28.6000"), Decimal("77.2000"))].expires_at == T0 + timedelta(days=30)
    assert s.sources[W].fetched_at == T0 and s.sources[W].expires_at == T0 + timedelta(minutes=30)


def test_fresh_hit_is_served_from_cache_without_fetching(env):
    cached, service, _, clock = env
    snap(cached)
    clock.advance(minutes=29)
    s = snap(cached)
    assert sources(s) == {p: "cache" for p in ALL}
    assert len(service.calls) == 4  # only the first snapshot fetched
    assert s.sources[W].fetched_at == T0
    assert s.elevation_m == 217.0


def test_expired_entries_are_refetched_but_elevation_stays_cached(env):
    cached, service, _, clock = env
    snap(cached)
    clock.advance(minutes=30)  # exactly at expires_at: no longer fresh
    s = snap(cached)
    assert sources(s) == {W: "live", AQ: "live", OA: "live", EL: "cache"}
    assert service.count(W) == 2 and service.count(EL) == 1
    assert s.sources[W].fetched_at == T0 + timedelta(minutes=30)


def test_one_provider_cached_while_others_are_live(env):
    cached, service, store, _ = env
    store.rows[("weather", Decimal("28.6000"), Decimal("77.2000"))] = CacheEntry(
        encode(W, WeatherForecast(current=None, hourly=[], daily=[])), T0 - timedelta(minutes=5), T0 + timedelta(minutes=25)
    )
    s = snap(cached)
    assert sources(s) == {W: "cache", AQ: "live", EL: "live", OA: "live"}
    assert service.count(W) == 0


# ---- stale fallback ----


def test_failed_fetch_serves_stale_entry_marked_stale(env):
    cached, service, _, clock = env
    snap(cached)
    clock.advance(hours=2)
    service.failing[AQ] = ProviderUnavailableError(AQ, "HTTP 503 after 3 attempts")
    s = snap(cached)
    assert s.sources[AQ].source == "stale"
    assert s.sources[AQ].fetched_at == T0
    assert s.air_quality is not None
    assert s.failures == []  # data was served, but clearly labelled
    assert any("live fetch failed (HTTP 503 after 3 attempts)" in w and "stale" in w for w in s.warnings)


def test_stale_entry_at_exactly_max_stale_age_is_still_served(env):
    cached, service, _, clock = env
    snap(cached)
    clock.advance(hours=6)
    service.failing[W] = ProviderUnavailableError(W, "timeout after 3 attempts")
    assert snap(cached).sources[W].source == "stale"


def test_too_old_stale_data_is_rejected_and_provider_fails(env):
    cached, service, _, clock = env
    snap(cached)
    clock.advance(hours=6, seconds=1)
    service.failing[W] = ProviderUnavailableError(W, "timeout after 3 attempts")
    s = snap(cached)
    assert W not in s.sources and s.weather is None
    assert [(f.provider, f.kind, f.reason) for f in s.failures] == [(W, "unavailable", "timeout after 3 attempts")]
    assert any("older than the max stale age (6 h) and was not used" in w for w in s.warnings)


def test_failure_without_any_cached_entry_is_reported(env):
    cached, service, _, _ = env
    service.failing[OA] = ProviderUnavailableError(OA, "HTTP 401 (check API key)")
    s = snap(cached)
    assert s.stations is None and OA not in s.sources
    assert s.failures[0].provider == OA


# ---- grid cells ----


@pytest.mark.parametrize(
    ("lat", "lon", "cell"),
    [
        (28.61, 77.21, ("28.6000", "77.2000")),
        (28.624999, 77.224999, ("28.6000", "77.2000")),  # just below the cell edge
        (28.625, 77.225, ("28.6500", "77.2500")),  # exact midpoint rounds away from zero
        (-28.625, -77.225, ("-28.6500", "-77.2500")),  # symmetric for negatives
        (-28.624999, -77.224999, ("-28.6000", "-77.2000")),
        (0.02, -0.02, ("0.0000", "0.0000")),
        (89.99, 179.99, ("90.0000", "180.0000")),
        (-90, -180, ("-90.0000", "-180.0000")),
    ],
)
def test_grid_rounding_at_cell_edges(lat, lon, cell):
    c = to_cell(lat, lon, 0.05)
    assert (c.lat, c.lon) == (Decimal(cell[0]), Decimal(cell[1]))


@pytest.mark.parametrize(
    ("grid", "lat", "expected"), [(0.1, 28.65, "28.7000"), (0.25, 28.61, "28.5000"), (0.07, 89.99, "90.0000")]
)
def test_other_grid_sizes_and_clamping(grid, lat, expected):
    assert to_cell(lat, 0, grid).lat == Decimal(expected)


def test_users_in_the_same_cell_share_cached_data(env):
    cached, service, _, _ = env
    snap(cached, 28.61, 77.21)
    s = snap(cached, 28.59, 77.22)  # ~2 km away, same cell
    assert sources(s) == {p: "cache" for p in ALL}
    s2 = snap(cached, 28.63, 77.21)  # next cell north
    assert sources(s2) == {p: "live" for p in ALL}


def test_providers_are_queried_at_the_cell_centre_not_the_exact_point(env):
    cached, service, _, _ = env
    s = snap(cached, 28.6123, 77.2071)
    assert {(lat, lon) for _, lat, lon in service.calls} == {(28.6, 77.2)}
    assert (s.latitude, s.longitude) == (28.6, 77.2)
    assert (s.cell.latitude, s.cell.longitude, s.cell.grid_degrees) == (28.6, 77.2, 0.05)


# ---- resilience ----


def test_cache_read_failure_falls_back_to_live(env, caplog):
    cached, service, store, _ = env
    store.fail_get = True
    s = snap(cached)
    assert sources(s) == {p: "live" for p in ALL}
    assert any(w.startswith("cache: read failed") for w in s.warnings)


def test_cache_write_failure_still_returns_live_data(env):
    cached, _, store, _ = env
    store.fail_put = True
    s = snap(cached)
    assert s.weather is not None and sources(s)[W] == "live"
    assert any(w.startswith("cache: write failed") for w in s.warnings)


def test_corrupted_cached_payload_is_treated_as_a_miss(env):
    cached, service, store, _ = env
    store.rows[("weather", Decimal("28.6000"), Decimal("77.2000"))] = CacheEntry(
        {"unexpected": "shape"}, T0, T0 + timedelta(minutes=30)
    )
    s = snap(cached)
    assert sources(s)[W] == "live" and service.count(W) == 1


def test_cached_station_readings_keep_ageing(env):
    cached, _, _, clock = env
    snap(cached)  # station reading measured at T0
    clock.advance(minutes=20)
    s = snap(cached)
    assert s.sources[OA].source == "cache"
    assert s.stations.stations[0].pm2_5.age_minutes == 20
    assert s.stations.stations[0].pm2_5.is_stale is False


def test_stale_station_readings_are_flagged_after_max_age(env):
    cached, service, _, clock = env
    snap(cached)
    clock.advance(hours=3, minutes=1)
    service.failing[OA] = ProviderUnavailableError(OA, "HTTP 503 after 3 attempts")
    s = snap(cached)
    reading = s.stations.stations[0].pm2_5
    assert s.sources[OA].source == "stale"
    assert reading.age_minutes == 181 and reading.is_stale is True


def test_cleanup_uses_clock_and_max_stale_age(env):
    cached, _, store, clock = env
    assert run(cached.cleanup()) == 7
    assert store.cleanup_calls == [(clock.now, timedelta(hours=6))]


def test_invalid_coordinates_are_rejected(env):
    cached, _, _, _ = env
    with pytest.raises(ValueError):
        snap(cached, 95, 0)


# ---- codec and configuration ----


def test_codec_round_trips_real_domain_models_through_json():
    import json

    weather = OpenMeteoWeatherClient.to_domain(parse_response(W, _ForecastResponse, load("openmeteo_forecast")))
    air = OpenMeteoAirQualityClient.to_domain(parse_response(AQ, _AirQualityResponse, load("openmeteo_air_quality")))
    for provider, value in ((W, weather), (AQ, air), (EL, 3411.0), (OA, station_report(T0))):
        payload = json.loads(json.dumps(encode(provider, value)))  # what JSONB stores
        assert decode(provider, payload) == value


def test_policy_is_built_from_settings():
    settings = Settings(
        _env_file=None,
        database_url="postgresql+psycopg://u:p@localhost:5432/db",
        env_cache_grid_degrees=0.1,
        env_cache_ttl_weather_minutes=15,
        env_cache_ttl_elevation_days=7,
        env_cache_max_stale_hours=2,
    )
    policy = CachePolicy.from_settings(settings)
    assert policy.grid_degrees == 0.1
    assert policy.ttls[W] == timedelta(minutes=15) and policy.ttls[AQ] == timedelta(minutes=30)
    assert policy.ttls[EL] == timedelta(days=7) and policy.max_stale == timedelta(hours=2)


@pytest.mark.parametrize(
    ("field", "bad"), [("env_cache_grid_degrees", 0), ("env_cache_grid_degrees", 2), ("env_cache_max_stale_hours", 0)]
)
def test_cache_settings_are_validated(field, bad):
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        Settings(_env_file=None, database_url="postgresql+psycopg://u:p@localhost:5432/db", **{field: bad})


def test_logging_keeps_httpx_at_warning():
    logging.getLogger("httpx").setLevel(logging.DEBUG)
    configure_logging(logging.INFO)
    assert logging.getLogger("httpx").getEffectiveLevel() == logging.WARNING
    assert logging.getLogger("httpcore").getEffectiveLevel() == logging.WARNING


def test_plain_environment_service_marks_sources_live():
    import httpx

    from app.services.environment import EnvironmentService
    from tests.unit.environment.conftest import Recorder

    routes = {
        "/v1/forecast": load("openmeteo_forecast"),
        "/v1/air-quality": load("openmeteo_air_quality"),
        "/v1/elevation": load("openmeteo_elevation"),
    }
    settings = Settings(_env_file=None, database_url="postgresql+psycopg://u:p@localhost:5432/db")

    async def go():
        async with EnvironmentService.create(
            settings=settings, transport=httpx.MockTransport(Recorder(routes)), clock=lambda: T0
        ) as service:
            return await service.get_snapshot(*DELHI)

    s = run(go())
    assert {p: src.source for p, src in s.sources.items()} == {W: "live", AQ: "live", EL: "live"}
    assert s.sources[W].fetched_at == T0 and s.sources[W].expires_at is None
    assert s.failures[0].provider == OA  # no key configured
