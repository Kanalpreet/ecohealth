"""Build the saved, SYNTHETIC risk scenarios used by tests and scripts/assess_risk.py.

Run from the repository root (writes backend/tests/fixtures/risk/*.json):

    backend\\.venv\\Scripts\\python.exe scripts\\build_risk_scenarios.py

The scenarios are smooth day/night curves within ranges typical of Delhi, not
real measurements:
- Winter smog (January): PM2.5 ~210-450 µg/m³ (CPCB "Severe" at night),
  6-17 °C, humid nights, light wind, low UV.
- Summer heatwave (late May): 31-45 °C (IMD heat-wave level), dry air
  (RH ~18-45 %), UV up to 11.5, dusty PM10.
Deterministic: running it again produces identical files.
"""

import json
import math
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.services.environment.models import (  # noqa: E402
    AirQualityForecast,
    AirQualityReading,
    CurrentConditions,
    DailyTemperature,
    EnvironmentSnapshot,
    GridCell,
    HourlyForecastPoint,
    ProviderSource,
    WeatherForecast,
)

OUT_DIR = BACKEND_DIR / "tests" / "fixtures" / "risk"
IST = timedelta(hours=5, minutes=30)
DELHI = (28.6, 77.2)


def diurnal(local_hour: float, mean: float, amplitude: float, peak_hour: float) -> float:
    """Smooth daily cycle peaking at `peak_hour` (local)."""
    return mean + amplitude * math.cos(2 * math.pi * (local_hour - peak_hour) / 24)


def daylight(local_hour: float, sunrise: float, sunset: float, peak: float) -> float:
    if not sunrise <= local_hour <= sunset:
        return 0.0
    return peak * math.sin(math.pi * (local_hour - sunrise) / (sunset - sunrise))


def build(name: str, generated_at: datetime, start: datetime, hours: int, spec: dict) -> EnvironmentSnapshot:
    def weather_at(t: datetime) -> dict:
        h = ((t + IST).hour + (t + IST).minute / 60) % 24
        temp = diurnal(h, spec["t_mean"], spec["t_amp"], spec["t_peak"])
        rh = diurnal(h, spec["rh_mean"], -spec["rh_amp"], spec["t_peak"])  # humidity lowest when hottest
        return {
            "temperature_c": round(temp, 1),
            "apparent_temperature_c": round(temp + spec["feels_offset"], 1),
            "relative_humidity_pct": round(min(100, max(0, rh))),
            "wind_speed_kmh": spec["wind"],
            "wind_direction_deg": spec["wind_dir"],
            "uv_index": round(daylight(h, *spec["uv"]), 2),
            "precipitation_mm": 0.0,
        }

    def air_at(t: datetime) -> dict:
        h = (t + IST).hour % 24
        pm25 = diurnal(h, spec["pm25_mean"], spec["pm25_amp"], spec["pm_peak"])
        pm10 = diurnal(h, spec["pm10_mean"], spec["pm10_amp"], spec["pm10_peak"])
        return {"pm2_5": round(pm25, 1), "pm10": round(pm10, 1), **spec["gases"]}

    times = [start + timedelta(hours=i) for i in range(hours)]
    hourly_w = [HourlyForecastPoint(time=t, **weather_at(t)) for t in times]
    days = sorted({t.date() for t in times})
    daily = [
        DailyTemperature(
            date=d,
            min_c=min(p.temperature_c for p in hourly_w if p.time.date() == d),
            max_c=max(p.temperature_c for p in hourly_w if p.time.date() == d),
        )
        for d in days
    ]
    aq_hour = generated_at.replace(minute=0)
    weather = WeatherForecast(
        current=CurrentConditions(observed_at=generated_at, **weather_at(generated_at)), hourly=hourly_w, daily=daily
    )
    air = AirQualityForecast(
        current=AirQualityReading(time=aq_hour, **air_at(aq_hour)),
        hourly=[AirQualityReading(time=t, **air_at(t)) for t in times],
    )
    live = {p: ProviderSource(source="live", fetched_at=generated_at)
            for p in ("open-meteo-weather", "open-meteo-air-quality", "open-meteo-elevation")}
    return EnvironmentSnapshot(
        latitude=DELHI[0], longitude=DELHI[1], generated_at=generated_at, weather=weather, air_quality=air,
        elevation_m=216.0, stations=None, failures=[], sources=live,
        warnings=[f"SYNTHETIC scenario '{name}' (scripts/build_risk_scenarios.py): not real measurements"],
        cell=GridCell(latitude=DELHI[0], longitude=DELHI[1], grid_degrees=0.05),
        elevation_cell=GridCell(latitude=28.61, longitude=77.21, grid_degrees=0.01),
    )


SCENARIOS = {
    "delhi_winter_smog": dict(
        generated_at=datetime(2026, 1, 10, 3, 30, tzinfo=UTC),  # 09:00 IST
        start=datetime(2026, 1, 9, 0, 0, tzinfo=UTC), hours=24 * 4,
        spec=dict(t_mean=11.5, t_amp=5.5, t_peak=15.0, rh_mean=75, rh_amp=20, feels_offset=-1.5,
                  wind=3.0, wind_dir=300, uv=(7.5, 17.5, 4.0),
                  pm25_mean=330, pm25_amp=120, pm_peak=2.0, pm10_mean=460, pm10_amp=170, pm10_peak=2.0,
                  gases={"no2": 85.0, "o3": 30.0, "so2": 22.0, "co": 2500.0}),
    ),
    "delhi_summer_heatwave": dict(
        generated_at=datetime(2026, 5, 27, 7, 30, tzinfo=UTC),  # 13:00 IST
        start=datetime(2026, 5, 26, 0, 0, tzinfo=UTC), hours=24 * 4,
        spec=dict(t_mean=38.0, t_amp=7.0, t_peak=15.0, rh_mean=31.5, rh_amp=13.5, feels_offset=1.0,
                  wind=18.0, wind_dir=290, uv=(6.0, 19.0, 11.5),
                  pm25_mean=75, pm25_amp=18, pm_peak=21.0, pm10_mean=260, pm10_amp=60, pm10_peak=16.0,
                  gases={"no2": 35.0, "o3": 160.0, "so2": 12.0, "co": 700.0}),
    ),
}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, args in SCENARIOS.items():
        snapshot = build(name, **args)
        path = OUT_DIR / f"{name}.json"
        path.write_text(json.dumps(snapshot.model_dump(mode="json"), indent=1) + "\n", encoding="utf-8")
        print(f"wrote {path.relative_to(BACKEND_DIR.parent)}")


if __name__ == "__main__":
    main()
