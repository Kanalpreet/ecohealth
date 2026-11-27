# Environmental Data Clients

Code: `backend/app/services/environment/`. Entry point:
`EnvironmentService.get_snapshot(lat, lon)` → `EnvironmentSnapshot`.

Scope (Go 2): **Open-Meteo** (weather, air quality, elevation) and **OpenAQ v3**
(ground monitoring stations). Not included: NASA FIRMS / fire data, caching (Go 3),
risk scoring and Indian AQI calculation (Go 4).

## Architecture

```
EnvironmentService.get_snapshot(lat, lon)          service.py
   ├── OpenMeteoWeatherClient     ─┐                open_meteo.py
   ├── OpenMeteoAirQualityClient   ├─ concurrently (asyncio.gather)
   ├── OpenMeteoElevationClient    │
   └── OpenAQClient               ─┘                openaq.py
            │ each uses
            ▼
   ProviderHttpClient (httpx.AsyncClient)           http.py
     timeouts · retry with backoff (timeouts, 5xx, 429) · JSON decoding
     · raises ProviderUnavailableError / ProviderResponseError
   SlidingWindowRateLimiter (OpenAQ: 60/min, 2,000/h) ratelimit.py
```

- Each client validates the provider's JSON with **provider-specific Pydantic
  models**, then converts it into **provider-independent domain models**
  (`models.py`). The rest of the app only ever sees domain models.
- If one provider fails or has no data, the snapshot still contains the others
  plus a `ProviderFailure(provider, kind, reason)` entry. Reasons are short, safe
  strings (e.g. `HTTP 503 after 3 attempts`), never URLs, keys or response bodies.

## Domain models (all timestamps timezone-aware UTC)

| Model | Contents |
|---|---|
| `CurrentConditions` | observed_at, temperature_c, apparent_temperature_c, relative_humidity_pct, wind_speed_kmh, wind_direction_deg, uv_index, precipitation_mm |
| `HourlyForecastPoint` | time + the same weather fields |
| `DailyTemperature` | date (UTC calendar day), min_c, max_c |
| `WeatherForecast` | current, hourly (5 days), daily, warnings |
| `AirQualityReading` | time, pm2_5, pm10, no2, o3, so2, co (all µg/m³) |
| `AirQualityForecast` | current, hourly (past 1 day + 5-day forecast), warnings |
| `StationMeasurement` | value (µg/m³), measured_at, age_minutes, is_stale |
| `StationReading` | station id/name, data owner, distance_km, lat/lon, pm2_5, pm10 |
| `StationReport` | stations (nearest first), ignored_stale_stations, max_age_hours |
| `ProviderFailure` | provider, kind (`unavailable`, `invalid_response`, `not_configured`, `error`), reason |
| `EnvironmentSnapshot` | lat/lon, generated_at, weather, air_quality, elevation_m, stations, failures, warnings |

### Data validation rules

- **Contract violations are rejected** (`ProviderResponseError` → failure
  `invalid_response`): missing required keys, hourly arrays of different lengths,
  unexpected units (e.g. °F instead of °C), non-UTC responses, unparseable times.
- **Individual missing or implausible values are flagged**: `null` values stay
  `None`; values outside physical bounds (e.g. negative concentrations, humidity
  > 100 %, wind direction > 360°) are replaced by `None` and a warning such as
  `open-meteo-air-quality: 2 implausible pm2_5 value(s) removed` is added.
  These are plausibility checks, not health thresholds.
- Open-Meteo returns times without an offset; we request `timezone=GMT`, check
  `utc_offset_seconds == 0`, and attach UTC explicitly.

## HTTP layer

| Setting | Value |
|---|---|
| Timeout | 10 s total, 5 s connect |
| Attempts | 3 (1 try + 2 retries) |
| Retried | timeouts, HTTP 5xx, HTTP 429 |
| Backoff | 0.5 s, 1 s (doubling, max 4 s); for 429 `Retry-After` is honoured up to 4 s |
| Not retried | other 4xx (e.g. 401 bad key), connection refused/DNS errors, invalid JSON |

Request URLs contain coordinates (sensitive location data, design.md §6), so the
clients never log URLs or query strings. Keep the `httpx` logger at `WARNING` when
configuring logging (at `INFO` it logs full request URLs).

## Open-Meteo (no API key)

Licence: **CC BY 4.0**. Attribution required wherever the data is shown:
**"Weather data by [Open-Meteo.com](https://open-meteo.com/)"**. Air quality data
comes from the Copernicus Atmosphere Monitoring Service (CAMS) and elevation from
the Copernicus DEM (GLO-90), both via Open-Meteo. The free API is for
**non-commercial use**: limits about **600 calls/min, 5,000/hour, 10,000/day**
(responses carry `x-ratelimit-*` headers; one call can cost more than 1 unit).

### Weather forecast

`GET https://api.open-meteo.com/v1/forecast`

| Parameter | Value |
|---|---|
| `latitude`, `longitude` | decimal degrees |
| `current`, `hourly` | `temperature_2m, apparent_temperature, relative_humidity_2m, wind_speed_10m, wind_direction_10m, uv_index, precipitation` |
| `daily` | `temperature_2m_max, temperature_2m_min` |
| `forecast_days` | `5` (hourly: 120 points from 00:00 UTC today) |
| `timezone` | `GMT` |
| `temperature_unit` / `wind_speed_unit` / `precipitation_unit` | `celsius` / `kmh` / `mm` |

Units checked: °C, %, km/h, °, mm; `uv_index` is unitless. `current` is updated
every 15 minutes (`interval: 900`).

### Air quality

`GET https://air-quality-api.open-meteo.com/v1/air-quality`

| Parameter | Value |
|---|---|
| `current`, `hourly` | `pm2_5, pm10, nitrogen_dioxide, ozone, sulphur_dioxide, carbon_monoxide` |
| `past_days` / `forecast_days` | `1` / `5` (hourly: 144 points) |
| `timezone` | `GMT` |

All values in **µg/m³** (the API writes `μg/m³` with a Greek mu; both spellings
are accepted). The last forecast hours may be `null` beyond the model horizon.

### Elevation

`GET https://api.open-meteo.com/v1/elevation?latitude=..&longitude=..` →
`{"elevation": [217.0]}` (metres above sea level, ~90 m resolution).

## OpenAQ v3 (API key)

- Key: `OPENAQ_API_KEY` in `backend/.env` (optional). Sent **only** in the
  `X-API-Key` header, never in URLs or logs. Without a key the OpenAQ part is
  skipped and recorded as `not_configured`; everything else still works.
- Rate limits (per key): **60 requests/min, 2,000 requests/hour**. A shared
  in-process sliding-window limiter refuses calls beyond these limits
  (recorded as `unavailable: local rate limit reached`), and HTTP 429 is retried
  with `Retry-After`.
- Attribution: "Air quality station data from **OpenAQ** (openaq.org)" plus the
  original data owner shown per station (e.g. CPCB, DPCC). Licences vary by source.

### Calls made per snapshot

1. `GET https://api.openaq.org/v3/locations?coordinates={lat},{lon}&radius=25000&limit=100`
   (radius in metres, **25,000 is the maximum**; `coordinates` is latitude,longitude).
   Results are **not** sorted by distance and include long-dead stations.
2. Locations are filtered to those with a PM2.5 or PM10 sensor whose `datetimeLast`
   is within the max age (default **3 hours**, setting `OPENAQ_MAX_AGE_HOURS`);
   the others are counted as `ignored_stale_stations`. The nearest
   `max_stations` (default 5) are kept.
3. `GET https://api.openaq.org/v3/locations/{id}/latest` for each kept station
   (≤ 6 requests per snapshot in total). Readings are matched to PM2.5/PM10 via the
   location's `sensors[].id` / `parameter.name` (`pm25`, `pm10`).
4. Each measurement carries `measured_at`, `age_minutes` and `is_stale`
   (older than the max age) so stale data is always visible.

## Configuration

| Setting | Default | Meaning |
|---|---|---|
| `OPENAQ_API_KEY` | unset | OpenAQ v3 key (optional) |
| `OPENAQ_MAX_AGE_HOURS` | `3` | Station readings older than this are ignored / marked stale |

## Testing

- Unit tests (`-m unit`): saved JSON fixtures in `backend/tests/fixtures/environment/`
  served by `httpx.MockTransport`; no network, no real sleeping.
- Live tests (`-m external`): one real call per API for Delhi; skipped
  automatically when offline or (OpenAQ) when the key is missing.
- Demo: `scripts/fetch_environment.py` (Delhi and Leh).
