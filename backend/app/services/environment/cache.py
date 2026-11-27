"""Cached environmental data: grid cells, TTLs and stale-while-error fallback.

CachedEnvironmentService wraps EnvironmentService (the clients are unchanged).
Per provider and grid cell:
    fresh cache hit -> "cache";  miss/expired -> fetch live, store -> "live";
    live fetch fails -> expired entry younger than the max stale age -> "stale",
    otherwise the provider is reported as failed.
See docs/caching.md.
"""

import asyncio
import logging
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from contextlib import AbstractContextManager, asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Protocol

import httpx
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import SessionLocal, get_engine
from app.repositories import env_cache as repo
from app.services.environment.http import RetryPolicy
from app.services.environment.models import (
    AirQualityForecast,
    EnvironmentSnapshot,
    GridCell,
    ProviderFailure,
    ProviderName,
    ProviderSource,
    StationMeasurement,
    StationReport,
    WeatherForecast,
)
from app.services.environment.open_meteo import AIR_QUALITY_PROVIDER, ELEVATION_PROVIDER, WEATHER_PROVIDER
from app.services.environment.openaq import PROVIDER as OPENAQ_PROVIDER
from app.services.environment.service import (
    PROVIDER_ORDER,
    EnvironmentService,
    check_coordinates,
    collect_warnings,
    failure_from,
)

logger = logging.getLogger(__name__)

# Snapshot provider name -> env_cache.provider value
CACHE_KEYS: dict[ProviderName, str] = {
    WEATHER_PROVIDER: "weather",
    AIR_QUALITY_PROVIDER: "air_quality",
    ELEVATION_PROVIDER: "elevation",
    OPENAQ_PROVIDER: "openaq",
}
_CELL_QUANTUM = Decimal("0.0001")  # env_cache.cell_lat/lon have 4 decimals


# ---------------------------------------------------------------------------
# Grid cells
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Cell:
    lat: Decimal
    lon: Decimal
    grid: Decimal


def to_cell(latitude: float, longitude: float, grid_degrees: float) -> Cell:
    """Snap a coordinate to the centre of its grid cell (half away from zero, exact decimals)."""
    grid = Decimal(str(grid_degrees))

    def snap(value: float, low: int, high: int) -> Decimal:
        steps = (Decimal(str(value)) / grid).quantize(Decimal(1), rounding=ROUND_HALF_UP)
        snapped = (steps * grid).quantize(_CELL_QUANTUM, rounding=ROUND_HALF_UP)
        clamped = min(max(snapped, Decimal(low)), Decimal(high))  # grids that don't divide 90/180
        return clamped.quantize(_CELL_QUANTUM)

    return Cell(lat=snap(latitude, -90, 90), lon=snap(longitude, -180, 180), grid=grid)


# ---------------------------------------------------------------------------
# Payload codec: domain models <-> JSON (never provider JSON)
# ---------------------------------------------------------------------------


class ElevationPayload(BaseModel):
    elevation_m: float


_PAYLOAD_MODELS: dict[ProviderName, type[BaseModel]] = {
    WEATHER_PROVIDER: WeatherForecast,
    AIR_QUALITY_PROVIDER: AirQualityForecast,
    OPENAQ_PROVIDER: StationReport,
}


def encode(provider: ProviderName, value: Any) -> dict[str, Any]:
    if provider == ELEVATION_PROVIDER:
        return ElevationPayload(elevation_m=value).model_dump(mode="json")
    return value.model_dump(mode="json")


def decode(provider: ProviderName, payload: dict[str, Any]) -> Any:
    """Raises pydantic.ValidationError if the stored payload no longer fits the model."""
    if provider == ELEVATION_PROVIDER:
        return ElevationPayload.model_validate(payload).elevation_m
    return _PAYLOAD_MODELS[provider].model_validate(payload)


def refresh_station_ages(report: StationReport, now: datetime) -> StationReport:
    """Recompute age_minutes/is_stale for cached station readings (they keep ageing)."""
    max_age = timedelta(hours=report.max_age_hours)

    def refresh(m: StationMeasurement | None) -> StationMeasurement | None:
        if m is None:
            return None
        age = now - m.measured_at
        return m.model_copy(
            update={"age_minutes": max(0, int(age.total_seconds() // 60)), "is_stale": age > max_age}
        )

    stations = [s.model_copy(update={"pm2_5": refresh(s.pm2_5), "pm10": refresh(s.pm10)}) for s in report.stations]
    return report.model_copy(update={"stations": stations})


# ---------------------------------------------------------------------------
# Cache store (database access, run in a thread so the event loop never blocks)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CacheEntry:
    payload: dict[str, Any]
    fetched_at: datetime
    expires_at: datetime


CacheKey = tuple[str, Decimal, Decimal]  # (env_cache.provider, cell_lat, cell_lon)


def cache_key(provider: str, cell: Cell) -> CacheKey:
    return (provider, cell.lat, cell.lon)


class CacheStore(Protocol):
    """Batch interface: one read and at most one write per snapshot."""

    async def get_many(self, keys: Sequence[CacheKey]) -> dict[CacheKey, CacheEntry]: ...
    async def put_many(self, items: Sequence[tuple[CacheKey, CacheEntry]]) -> None: ...
    async def cleanup(self, now: datetime, max_stale: timedelta) -> int: ...


SessionFactory = Callable[[], AbstractContextManager[Session]]


def default_session_factory() -> Session:
    return SessionLocal(bind=get_engine())


class SqlCacheStore:
    """CacheStore backed by the env_cache table.

    get_many is ONE query; put_many is ONE transaction. A snapshot therefore uses
    one pooled connection at a time.
    """

    def __init__(self, session_factory: SessionFactory = default_session_factory) -> None:
        self._session_factory = session_factory

    async def get_many(self, keys: Sequence[CacheKey]) -> dict[CacheKey, CacheEntry]:
        def work() -> dict[CacheKey, CacheEntry]:
            with self._session_factory() as session:
                rows = repo.get_entries(session, keys)
                return {
                    (row.provider, row.cell_lat, row.cell_lon): CacheEntry(row.payload, row.fetched_at, row.expires_at)
                    for row in rows
                }

        return await asyncio.to_thread(work)

    async def put_many(self, items: Sequence[tuple[CacheKey, CacheEntry]]) -> None:
        def work() -> None:
            with self._session_factory() as session:
                for (provider, lat, lon), entry in items:
                    repo.upsert_entry(session, provider, lat, lon, entry.payload, entry.fetched_at, entry.expires_at)
                session.commit()

        if items:
            await asyncio.to_thread(work)

    async def cleanup(self, now: datetime, max_stale: timedelta) -> int:
        def work() -> int:
            with self._session_factory() as session:
                deleted = repo.delete_unusable(session, now, max_stale)
                session.commit()
                return deleted

        return await asyncio.to_thread(work)


# ---------------------------------------------------------------------------
# Policy and service
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CachePolicy:
    grid_degrees: float
    ttls: dict[ProviderName, timedelta]
    max_stale: timedelta
    elevation_grid_degrees: float = 0.01  # elevation varies a lot over short distances in mountains

    @classmethod
    def from_settings(cls, settings: Settings) -> "CachePolicy":
        return cls(
            grid_degrees=settings.env_cache_grid_degrees,
            elevation_grid_degrees=settings.env_cache_elevation_grid_degrees,
            ttls={
                WEATHER_PROVIDER: timedelta(minutes=settings.env_cache_ttl_weather_minutes),
                AIR_QUALITY_PROVIDER: timedelta(minutes=settings.env_cache_ttl_air_quality_minutes),
                OPENAQ_PROVIDER: timedelta(minutes=settings.env_cache_ttl_openaq_minutes),
                ELEVATION_PROVIDER: timedelta(days=settings.env_cache_ttl_elevation_days),
            },
            max_stale=timedelta(hours=settings.env_cache_max_stale_hours),
        )


@dataclass
class _Outcome:
    value: Any = None
    source: ProviderSource | None = None
    failure: ProviderFailure | None = None
    warnings: list[str] = field(default_factory=list)
    to_store: CacheEntry | None = None  # set when fetched live; written in one batch


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")


def _grid_cell(cell: Cell) -> GridCell:
    return GridCell(latitude=float(cell.lat), longitude=float(cell.lon), grid_degrees=float(cell.grid))


class CachedEnvironmentService:
    def __init__(
        self,
        service: EnvironmentService,
        store: CacheStore,
        policy: CachePolicy,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self.service = service
        self.store = store
        self.policy = policy
        self._clock = clock

    @classmethod
    @asynccontextmanager
    async def create(
        cls,
        settings: Settings | None = None,
        store: CacheStore | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        retry: RetryPolicy = RetryPolicy(),
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> AsyncIterator["CachedEnvironmentService"]:
        settings = settings or get_settings()
        async with EnvironmentService.create(
            settings=settings, transport=transport, retry=retry, sleep=sleep, clock=clock
        ) as service:
            yield cls(service, store or SqlCacheStore(), CachePolicy.from_settings(settings), clock)

    def cells_for(self, latitude: float, longitude: float) -> dict[ProviderName, Cell]:
        """Elevation uses its own finer grid; the other providers share the main grid."""
        main = to_cell(latitude, longitude, self.policy.grid_degrees)
        fine = to_cell(latitude, longitude, self.policy.elevation_grid_degrees)
        return {p: (fine if p == ELEVATION_PROVIDER else main) for p in PROVIDER_ORDER}

    async def get_snapshot(self, latitude: float, longitude: float) -> EnvironmentSnapshot:
        check_coordinates(latitude, longitude)
        cells = self.cells_for(latitude, longitude)
        now = self._clock()
        snapshot_warnings: list[str] = []

        # 1) ONE read for every provider of this snapshot.
        keys = {p: cache_key(CACHE_KEYS[p], cells[p]) for p in PROVIDER_ORDER}
        try:
            entries = await self.store.get_many(list(keys.values()))
        except Exception as exc:  # noqa: BLE001 - the cache must never break a snapshot
            logger.warning("Cache read failed: %s", type(exc).__name__)
            snapshot_warnings.append("cache: read failed; fetching live")
            entries = {}

        # 2) Resolve providers concurrently (cache, live or stale).
        results = await asyncio.gather(
            *(self._resolve(p, cells[p], now, entries.get(keys[p])) for p in PROVIDER_ORDER)
        )
        outcomes = dict(zip(PROVIDER_ORDER, results, strict=True))

        # 3) ONE write (single transaction) for everything fetched live.
        to_store = [(keys[p], o.to_store) for p, o in outcomes.items() if o.to_store is not None]
        if to_store:
            try:
                await self.store.put_many(to_store)
            except Exception as exc:  # noqa: BLE001 - live data is still returned
                logger.warning("Cache write failed: %s", type(exc).__name__)
                snapshot_warnings.append("cache: write failed; live data not cached")

        values = {p: o.value for p, o in outcomes.items()}
        warnings = collect_warnings(values[WEATHER_PROVIDER], values[AIR_QUALITY_PROVIDER], values[OPENAQ_PROVIDER])
        for outcome in outcomes.values():
            warnings.extend(outcome.warnings)
        warnings.extend(snapshot_warnings)

        main = cells[WEATHER_PROVIDER]
        return EnvironmentSnapshot(
            # The snapshot describes the cell, not the user's exact point.
            latitude=float(main.lat),
            longitude=float(main.lon),
            generated_at=now,
            weather=values[WEATHER_PROVIDER],
            air_quality=values[AIR_QUALITY_PROVIDER],
            elevation_m=values[ELEVATION_PROVIDER],
            stations=values[OPENAQ_PROVIDER],
            failures=[o.failure for o in outcomes.values() if o.failure is not None],
            warnings=warnings,
            sources={p: o.source for p, o in outcomes.items() if o.source is not None},
            cell=_grid_cell(main),
            elevation_cell=_grid_cell(cells[ELEVATION_PROVIDER]),
        )

    async def cleanup(self) -> int:
        """Delete cache rows that can no longer be served. Returns the number deleted."""
        return await self.store.cleanup(self._clock(), self.policy.max_stale)

    # ---- one provider ----

    async def _resolve(
        self, provider: ProviderName, cell: Cell, now: datetime, entry: CacheEntry | None
    ) -> _Outcome:
        outcome = _Outcome()
        cached = None
        if entry is not None:
            try:
                cached = decode(provider, entry.payload)
            except ValidationError:
                logger.warning("Cached %s payload no longer matches the model; treating as a miss", provider)
                entry = None

        if entry is not None and now < entry.expires_at:
            outcome.value = self._prepare(provider, cached, now)
            outcome.source = ProviderSource(source="cache", fetched_at=entry.fetched_at, expires_at=entry.expires_at)
            return outcome

        try:
            value = await self.service.fetch(provider, float(cell.lat), float(cell.lon))
        except Exception as exc:  # noqa: BLE001 - ProviderError or a client bug, handled the same way
            failure = failure_from(provider, exc)
            if entry is not None and now - entry.fetched_at <= self.policy.max_stale:
                outcome.value = self._prepare(provider, cached, now)
                outcome.source = ProviderSource(
                    source="stale", fetched_at=entry.fetched_at, expires_at=entry.expires_at
                )
                outcome.warnings.append(
                    f"{provider}: live fetch failed ({failure.reason}); "
                    f"serving stale data fetched at {_iso(entry.fetched_at)}"
                )
                return outcome
            if entry is not None:
                outcome.warnings.append(
                    f"{provider}: cached data from {_iso(entry.fetched_at)} is older than the "
                    f"max stale age ({self.policy.max_stale.total_seconds() / 3600:g} h) and was not used"
                )
            outcome.failure = failure
            return outcome

        expires_at = now + self.policy.ttls[provider]
        outcome.to_store = CacheEntry(encode(provider, value), now, expires_at)
        outcome.value = value
        outcome.source = ProviderSource(source="live", fetched_at=now, expires_at=expires_at)
        return outcome

    @staticmethod
    def _prepare(provider: ProviderName, value: Any, now: datetime) -> Any:
        return refresh_station_ages(value, now) if provider == OPENAQ_PROVIDER else value
