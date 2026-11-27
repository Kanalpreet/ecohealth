# Environmental Data Cache

Code: `backend/app/services/environment/cache.py` (cached service, grid, codec),
`backend/app/repositories/env_cache.py` (database access), table `env_cache`.
Entry point: `CachedEnvironmentService.get_snapshot(lat, lon)`.

## Concepts in plain language

- **Caching**: keeping a copy of an answer we already fetched so the next request
  can reuse it instead of asking the provider again. It makes EcoHealth faster,
  keeps us within the providers' rate limits, and lets us survive short outages.
- **TTL (time to live)**: how long a cached answer counts as fresh. A weather
  forecast fetched at 10:00 with a 30-minute TTL is fresh until 10:30
  (`expires_at`). After that we fetch again.
- **Grid cells**: two families 300 m apart get the same weather and air quality.
  We round coordinates to a grid (default **0.05°**, about 5.5 km north–south) and
  cache per cell, so everyone in a cell shares one entry. Providers are queried at
  the **cell centre**, so cached data is identical for everyone in the cell, and a
  user's exact location is never stored in the cache or sent to the providers.
- **Stale-while-error fallback**: if a provider is down and the fresh copy has
  expired, an older copy is often better than nothing, *if it is not too old* and
  *clearly labelled*. We serve an expired entry only when the live fetch failed
  and the entry is younger than the **max stale age** (default 6 h), and we mark
  it `stale` with its `fetched_at`. Older data is never served.
- **Why cache per provider**: each source changes at a different speed. Elevation
  never changes (30-day TTL), forecasts every half hour. Caching each provider
  separately also means one failing provider does not throw away the others'
  fresh data.

## Decisions

| Setting (`backend/.env`) | Default | Meaning |
|---|---|---|
| `ENV_CACHE_GRID_DEGREES` | `0.05` | Grid size in degrees (0.001–1) |
| `ENV_CACHE_TTL_WEATHER_MINUTES` | `30` | Weather forecast TTL |
| `ENV_CACHE_TTL_AIR_QUALITY_MINUTES` | `30` | Air quality forecast TTL |
| `ENV_CACHE_TTL_OPENAQ_MINUTES` | `30` | Station readings TTL |
| `ENV_CACHE_TTL_ELEVATION_DAYS` | `30` | Elevation TTL |
| `ENV_CACHE_MAX_STALE_HOURS` | `6` | Oldest data (by `fetched_at`) ever served as stale |

### Grid rounding

`cell = round(coordinate / grid) × grid`, using exact decimals and rounding
half away from zero, stored with 4 decimals. With the default grid:
`28.61 → 28.60`, `28.625 → 28.65` (exact midpoint rounds up), `-28.625 → -28.65`
(symmetric), `77.21 → 77.20`. Latitudes stay within ±90 and longitudes within ±180.

Trade-off: OpenAQ station distances are measured from the cell centre, so they can
be up to ~3.9 km off from the user's own position (half a cell diagonal).

### Request flow per provider

```
cached entry?  ── fresh (now < expires_at) ──────────────► source "cache"
      │
      └─ missing or expired ─► fetch live ── success ─► store (upsert) ─► source "live"
                                    │
                                    └─ failure ─► entry younger than max stale age?
                                                    ├─ yes ─► source "stale" (+ warning)
                                                    └─ no  ─► provider listed in failures
```

- Each snapshot reports, per provider, `source` (`live`, `cache`, `stale`),
  `fetched_at` and `expires_at` in `EnvironmentSnapshot.sources`.
- Only successful results are cached, as **domain models serialised to JSON**
  (never provider JSON). If a stored payload no longer matches the model (e.g.
  after a code change), it is treated as a miss.
- Cached OpenAQ readings get `age_minutes` / `is_stale` recalculated on read, so a
  cached station reading never looks younger than it is.
- **The cache must never break a snapshot**: if the database is unreachable, the
  service fetches live and adds a warning.
- Concurrent requests for the same cell may both fetch live; the
  `INSERT … ON CONFLICT DO UPDATE` upsert keeps exactly one row per
  (provider, cell).

### Cleanup

`CachedEnvironmentService.cleanup()` deletes rows that can no longer be served:
**expired AND fetched longer ago than the max stale age**
(`expires_at < now AND fetched_at < now − max_stale`). Rows are not deleted by age
alone, otherwise 7-hour-old elevation entries (fresh for 30 days) would be lost.
A scheduler in a later go will call it periodically.

## Table `env_cache`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `provider` | varchar(32) | CHECK: `weather`, `air_quality`, `elevation`, `openaq` |
| `cell_lat` | numeric(7,4) | CHECK −90…90 |
| `cell_lon` | numeric(8,4) | CHECK −180…180 |
| `payload` | JSONB | serialised domain model |
| `fetched_at` | timestamptz | when the provider was called |
| `expires_at` | timestamptz | `fetched_at + TTL`; indexed; CHECK `expires_at > fetched_at` |

`UNIQUE (provider, cell_lat, cell_lon)`; index on `expires_at`; Row Level Security
enabled with no policies (like every table in `public`).

Privacy: rows contain grid-cell centres and public environmental data only:
no user ids, no exact coordinates, no health data.

## Logging

`app.core.logging.configure_logging()` (called by `main.py` and the demo script)
keeps the `httpx` / `httpcore` loggers at `WARNING`: at `INFO` they log full
request URLs, which contain coordinates.

## Testing

- Unit (`-m unit`, `tests/unit/environment/test_cache.py`): fake clock, fake
  store and fake provider service: hit, miss, expiry, stale fallback, too-old
  stale data rejected, one provider cached while others are live, grid rounding
  at cell edges, cache read/write failures, corrupted payloads, ageing of cached
  station readings, settings validation, httpx log level.
- Integration (`-m integration`, `tests/integration/test_env_cache.py`): real
  `env_cache` table in Supabase inside a rolled-back transaction: upsert, unique
  and CHECK constraints, expiry query, cleanup, JSONB round trip, and the cached
  service end to end. Test rows use cells near the South Pole (lat ≤ −89) and the
  session teardown asserts none are left.
- Demo: `backend\.venv\Scripts\python.exe scripts\fetch_environment.py` twice in
  a row shows `LIVE` then `CACHE` for every provider.

## Known limitations

- **Elevation varies inside a cell in mountains.** Leh's cell centre is ~2 km from
  the town and Open-Meteo reports 3742 m there vs 3411 m at the town. Fine for
  weather and air quality; for altitude risk a finer grid for elevation is advisable.
- Cache reads are one query per provider (4 per snapshot, run in threads); each
  uses a pooled connection.
- Concurrent misses for the same cell may both call the provider (no request
  coalescing); the upsert still keeps a single row.
