"""Demo: print a readable environmental snapshot for Delhi and Leh.

Run from the repository root (uses the backend virtual environment):

    backend\\.venv\\Scripts\\python.exe scripts\\fetch_environment.py

Calls the real APIs (Open-Meteo; OpenAQ if OPENAQ_API_KEY is set in backend/.env).
Never prints API keys. Times are shown in UTC and in India Standard Time.
"""

import asyncio
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.database import get_engine  # noqa: E402
from app.core.logging import configure_logging  # noqa: E402
from app.services.environment import CachedEnvironmentService, EnvironmentSnapshot  # noqa: E402

LOCATIONS = [("Delhi", 28.61, 77.21), ("Leh", 34.15, 77.58)]
DISPLAY_TZ = ZoneInfo("Asia/Kolkata")  # both demo locations are in India
UG = "ug/m3"  # ASCII on purpose: the Windows console cannot print "µg/m³"


def when(dt: datetime) -> str:
    return f"{dt:%d %b %H:%M} UTC ({dt.astimezone(DISPLAY_TZ):%H:%M} IST)"


def fmt(value: float | None, unit: str = "", digits: int = 1) -> str:
    return "n/a" if value is None else f"{value:.{digits}f}{(' ' + unit) if unit else ''}"


def print_sources(snap: EnvironmentSnapshot) -> None:
    print("Sources:")
    for provider, src in snap.sources.items():
        expires = f", expires {when(src.expires_at)}" if src.expires_at else ""
        print(f"  {provider:24s} {src.source.upper():6s} fetched {when(src.fetched_at)}{expires}")
    for failure in snap.failures:
        print(f"  {failure.provider:24s} FAILED ({failure.kind}: {failure.reason})")


def print_snapshot(name: str, requested: tuple[float, float], snap: EnvironmentSnapshot) -> None:
    print("=" * 72)
    cell = f"grid cell ({snap.latitude:.2f}, {snap.longitude:.2f})" if snap.cell else ""
    print(f"{name}  requested {requested}  {cell}")
    print(f"generated {when(snap.generated_at)}")
    print("=" * 72)
    print_sources(snap)

    w = snap.weather
    if w and w.current:
        c = w.current
        print(f"Weather (as of {when(c.observed_at)}):")
        print(f"  Temperature {fmt(c.temperature_c, 'C')}  (feels like {fmt(c.apparent_temperature_c, 'C')}),"
              f" humidity {fmt(c.relative_humidity_pct, '%', 0)}")
        print(f"  Wind {fmt(c.wind_speed_kmh, 'km/h')} from {fmt(c.wind_direction_deg, 'deg', 0)},"
              f" UV index {fmt(c.uv_index)}, precipitation {fmt(c.precipitation_mm, 'mm')}")
        if w.daily:
            d = w.daily[0]
            print(f"  Today (UTC day {d.date}): min {fmt(d.min_c, 'C')}, max {fmt(d.max_c, 'C')}")

    aq = snap.air_quality
    if aq and aq.current:
        print(f"Air quality, model (as of {when(aq.current.time)}):")
        print(f"  PM2.5 {fmt(aq.current.pm2_5, UG)}   PM10 {fmt(aq.current.pm10, UG)}")
        now = snap.generated_at
        next_24h = [p for p in aq.hourly if now < p.time <= now + timedelta(hours=24) and p.pm2_5 is not None]
        if next_24h:
            worst = max(next_24h, key=lambda p: p.pm2_5)
            cleanest = min(next_24h, key=lambda p: p.pm2_5)
            average = sum(p.pm2_5 for p in next_24h) / len(next_24h)
            print(f"  Next 24 h PM2.5: average {fmt(average, UG)}")
            print(f"    worst hour    {when(worst.time)}: {fmt(worst.pm2_5, UG)}")
            print(f"    cleanest hour {when(cleanest.time)}: {fmt(cleanest.pm2_5, UG)}")
            trend = "  ".join(f"{p.time.astimezone(DISPLAY_TZ):%H}h:{p.pm2_5:.0f}" for p in next_24h[::3])
            print(f"    every 3 h (IST): {trend}")

    print(f"Elevation: {fmt(snap.elevation_m, 'm', 0)}")

    st = snap.stations
    if st is not None:
        print(f"Monitoring stations within {st.radius_km:g} km (readings newer than {st.max_age_hours:g} h):")
        for s in st.stations:
            parts = []
            for label, m in (("PM2.5", s.pm2_5), ("PM10", s.pm10)):
                if m is not None:
                    stale = " STALE" if m.is_stale else ""
                    parts.append(f"{label} {m.value:.0f} {UG} ({m.age_minutes} min ago{stale})")
            owner = f" [{s.data_owner}]" if s.data_owner else ""
            print(f"  {s.distance_km:5.1f} km  {s.name}{owner}")
            print(f"           {'; '.join(parts) or 'no PM readings'}")
        if not st.stations:
            print("  none with recent PM data")
        if st.ignored_stale_stations:
            print(f"  ({st.ignored_stale_stations} station(s) ignored: no PM reading in the last {st.max_age_hours:g} h)")

    if snap.failures:
        print("Failed providers:")
        for f in snap.failures:
            print(f"  - {f.provider}: {f.kind} ({f.reason})")
    else:
        print("Failed providers: none")
    for warning in snap.warnings:
        print(f"Note: {warning}")
    print()


async def main() -> None:
    try:
        async with CachedEnvironmentService.create() as service:
            snapshots = await asyncio.gather(*(service.get_snapshot(lat, lon) for _, lat, lon in LOCATIONS))
    finally:
        get_engine().dispose()
    for (name, lat, lon), snap in zip(LOCATIONS, snapshots, strict=True):
        print_snapshot(name, (lat, lon), snap)
    print("Weather and air quality data by Open-Meteo.com (CC BY 4.0, CAMS / Copernicus);"
          " station data from OpenAQ (openaq.org) and the listed data owners.")


if __name__ == "__main__":
    sys.stdout.reconfigure(errors="replace")
    configure_logging()  # keeps httpx at WARNING: no request URLs with coordinates
    asyncio.run(main())
