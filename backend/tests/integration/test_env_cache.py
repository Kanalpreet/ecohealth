"""env_cache table, repository and SqlCacheStore against Supabase (rolled back)."""

import asyncio
import json
import threading
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models import EnvCache
from app.repositories import env_cache as repo
from app.services.environment.cache import (
    CacheEntry,
    CachedEnvironmentService,
    Cell,
    SqlCacheStore,
    decode,
    encode,
)
from app.services.environment.open_meteo import OpenMeteoWeatherClient, _ForecastResponse, parse_response
from tests.integration.conftest import TEST_CACHE_MAX_LAT

pytestmark = pytest.mark.integration

LAT = Decimal("-89.5000")  # test-only cells (see conftest.TEST_CACHE_MAX_LAT)
LON = Decimal("10.0000")
NOW = datetime.now(UTC).replace(microsecond=0)
assert float(LAT) <= TEST_CACHE_MAX_LAT


def put(session, provider="weather", lon=LON, payload=None, fetched_at=NOW, ttl=timedelta(minutes=30)):
    repo.upsert_entry(session, provider, LAT, lon, payload or {"v": 1}, fetched_at, fetched_at + ttl)
    session.flush()


def rows(session, lon=LON) -> int:
    stmt = select(func.count()).select_from(EnvCache).where(EnvCache.cell_lat == LAT, EnvCache.cell_lon == lon)
    return session.execute(stmt).scalar_one()


def constraint_name(exc_info) -> str | None:
    return getattr(getattr(exc_info.value.orig, "diag", None), "constraint_name", None)


# ---- repository ----


def test_upsert_inserts_then_updates_the_same_row(db_session):
    put(db_session, payload={"v": 1}, fetched_at=NOW - timedelta(minutes=40))
    first_id = repo.get_entry(db_session, "weather", LAT, LON).id

    put(db_session, payload={"v": 2}, fetched_at=NOW)
    db_session.expire_all()
    entry = repo.get_entry(db_session, "weather", LAT, LON)

    assert rows(db_session) == 1
    assert entry.id == first_id  # updated in place, not duplicated
    assert entry.payload == {"v": 2}
    assert entry.fetched_at == NOW and entry.expires_at == NOW + timedelta(minutes=30)


def test_same_cell_different_providers_are_separate_rows(db_session):
    for provider in ("weather", "air_quality", "elevation", "openaq"):
        put(db_session, provider=provider)
    assert rows(db_session) == 4


def test_unique_constraint_blocks_plain_duplicate_inserts(db_session):
    put(db_session)
    db_session.add(
        EnvCache(provider="weather", cell_lat=LAT, cell_lon=LON, payload={}, fetched_at=NOW,
                 expires_at=NOW + timedelta(minutes=1))
    )
    with pytest.raises(IntegrityError) as exc_info:
        db_session.flush()
    assert constraint_name(exc_info) == "uq_env_cache_provider_cell"


@pytest.mark.parametrize(
    ("overrides", "constraint"),
    [
        ({"provider": "fire"}, "ck_env_cache_provider_valid"),
        ({"expires_at": NOW}, "ck_env_cache_expires_after_fetch"),
        ({"cell_lat": Decimal("-91")}, "ck_env_cache_cell_lat_range"),
    ],
)
def test_check_constraints(db_session, overrides, constraint):
    values = {"provider": "weather", "cell_lat": LAT, "cell_lon": LON, "payload": {}, "fetched_at": NOW,
              "expires_at": NOW + timedelta(minutes=1), **overrides}
    db_session.add(EnvCache(**values))
    with pytest.raises(IntegrityError) as exc_info:
        db_session.flush()
    assert constraint_name(exc_info) == constraint


def test_jsonb_round_trip_of_a_real_domain_model(db_session):
    from tests.unit.environment.conftest import load

    weather = OpenMeteoWeatherClient.to_domain(
        parse_response("open-meteo-weather", _ForecastResponse, load("openmeteo_forecast"))
    )
    put(db_session, payload=encode("open-meteo-weather", weather))
    db_session.expire_all()
    stored = repo.get_entry(db_session, "weather", LAT, LON).payload

    assert isinstance(stored, dict)
    assert decode("open-meteo-weather", stored) == weather
    assert stored["current"]["observed_at"] == "2026-11-27T08:15:00Z"  # UTC in the payload
    assert json.dumps(stored)  # plain JSON, no provider format


def test_expiry_query_counts_only_expired_rows(db_session):
    before = repo.count_expired(db_session, NOW)
    put(db_session, lon=Decimal("10.0000"), fetched_at=NOW - timedelta(hours=1))  # expired 30 min ago
    put(db_session, lon=Decimal("10.0500"), fetched_at=NOW)  # fresh
    assert repo.count_expired(db_session, NOW) == before + 1


def test_cleanup_deletes_only_unusable_rows(db_session):
    old_expired = Decimal("11.0000")
    recent_expired = Decimal("11.0500")
    old_but_fresh = Decimal("11.1000")
    put(db_session, lon=old_expired, fetched_at=NOW - timedelta(hours=7))  # expired, beyond max stale
    put(db_session, lon=recent_expired, fetched_at=NOW - timedelta(hours=2))  # expired, still stale-usable
    put(db_session, provider="elevation", lon=old_but_fresh, fetched_at=NOW - timedelta(days=2),
        ttl=timedelta(days=30))  # old but fresh

    deleted = repo.delete_unusable(db_session, NOW, max_stale=timedelta(hours=6))

    assert deleted >= 1
    assert rows(db_session, old_expired) == 0
    assert rows(db_session, recent_expired) == 1
    assert rows(db_session, old_but_fresh) == 1


# ---- SqlCacheStore + CachedEnvironmentService end to end ----


@pytest.fixture
def store(db_session):
    """SqlCacheStore over the test's rolled-back session.

    Production opens a new Session per call. Here every call shares ONE session
    (so everything is rolled back), and the providers run concurrently in worker
    threads, so a lock makes them take turns: a Session must not be used by two
    threads at once.
    """
    lock = threading.Lock()

    @contextmanager
    def factory():
        with lock:
            yield db_session  # commits only release a SAVEPOINT; the test transaction is rolled back

    return SqlCacheStore(session_factory=factory)


def test_sql_store_batch_put_get_and_cleanup(store, db_session):
    old = ("openaq", LAT, Decimal("12.0000"))
    fresh = ("weather", LAT, Decimal("12.0000"))
    missing = ("air_quality", LAT, Decimal("12.0000"))
    asyncio.run(store.put_many([
        (old, CacheEntry({"x": 1}, NOW - timedelta(hours=8), NOW - timedelta(hours=7))),
        (fresh, CacheEntry({"y": 2}, NOW, NOW + timedelta(minutes=30))),
    ]))

    entries = asyncio.run(store.get_many([old, fresh, missing]))  # ONE query for all three keys
    assert set(entries) == {old, fresh}
    assert entries[old].payload == {"x": 1} and entries[old].fetched_at == NOW - timedelta(hours=8)
    assert entries[fresh].payload == {"y": 2}

    assert asyncio.run(store.cleanup(NOW, timedelta(hours=6))) >= 1
    assert set(asyncio.run(store.get_many([old, fresh]))) == {fresh}


def test_get_entries_returns_all_requested_rows_in_one_query(db_session):
    put(db_session, provider="weather", lon=Decimal("13.0000"))
    put(db_session, provider="elevation", lon=Decimal("13.0100"))
    rows_found = repo.get_entries(
        db_session, [("weather", LAT, Decimal("13.0000")), ("elevation", LAT, Decimal("13.0100")),
                     ("openaq", LAT, Decimal("13.0000"))]
    )
    assert {(r.provider, r.cell_lon) for r in rows_found} == {("weather", Decimal("13.0000")),
                                                              ("elevation", Decimal("13.0100"))}
    assert repo.get_entries(db_session, []) == []


def test_cached_service_live_then_cache_with_real_table(store):
    from tests.unit.environment.test_cache import POLICY, FakeClock, FakeService

    clock = FakeClock(NOW)
    service = FakeService(clock)
    cached = CachedEnvironmentService(service, store, POLICY, clock=clock)

    first = asyncio.run(cached.get_snapshot(-89.51, 10.01))
    clock.advance(minutes=5)
    second = asyncio.run(cached.get_snapshot(-89.512, 10.008))  # same 0.05° cell AND same 0.01° elevation cell
    third = asyncio.run(cached.get_snapshot(-89.49, 9.99))  # same 0.05° cell, different elevation cell

    assert not any(w.startswith("cache:") for w in first.warnings + second.warnings + third.warnings)
    assert {s.source for s in first.sources.values()} == {"live"}
    assert {s.source for s in second.sources.values()} == {"cache"}
    assert {p: s.source for p, s in third.sources.items()}["open-meteo-elevation"] == "live"
    assert {s.source for p, s in third.sources.items() if p != "open-meteo-elevation"} == {"cache"}
    assert len(service.calls) == 5  # 4 live on first snapshot + elevation for the new fine cell
    assert second.stations.stations[0].pm2_5.age_minutes == 5
