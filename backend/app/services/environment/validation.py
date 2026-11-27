"""Plausibility checks shared by the provider clients.

These are physical sanity bounds to catch broken data (e.g. negative
concentrations or the -999 "no data" sentinel), NOT health thresholds.
"""

from collections import Counter
from datetime import UTC, datetime

PLAUSIBLE_RANGES: dict[str, tuple[float, float]] = {
    "temperature_c": (-90.0, 60.0),
    "apparent_temperature_c": (-100.0, 80.0),
    "relative_humidity_pct": (0.0, 100.0),
    "wind_speed_kmh": (0.0, 500.0),
    "wind_direction_deg": (0.0, 360.0),
    "uv_index": (0.0, 25.0),
    "precipitation_mm": (0.0, 500.0),
    "pm2_5": (0.0, 3000.0),
    "pm10": (0.0, 5000.0),
    "no2": (0.0, 5000.0),
    "o3": (0.0, 5000.0),
    "so2": (0.0, 5000.0),
    "co": (0.0, 100000.0),
    "elevation_m": (-500.0, 9000.0),
}


class ValueCleaner:
    """Replace implausible values by None and count them for one warning per field."""

    def __init__(self, provider: str) -> None:
        self.provider = provider
        self.removed: Counter[str] = Counter()

    def clean(self, field: str, value: float | None) -> float | None:
        if value is None:
            return None
        low, high = PLAUSIBLE_RANGES[field]
        if not (low <= value <= high):  # also False for NaN
            self.removed[field] += 1
            return None
        return float(value)

    def warnings(self) -> list[str]:
        return [
            f"{self.provider}: {count} implausible {field} value(s) removed"
            for field, count in sorted(self.removed.items())
        ]


def naive_utc(text: str) -> datetime:
    """Parse an ISO time without offset that is known to be UTC (Open-Meteo, timezone=GMT)."""
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is not None:
        return parsed.astimezone(UTC)
    return parsed.replace(tzinfo=UTC)
