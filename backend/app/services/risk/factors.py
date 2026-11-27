"""Pure functions: factor sub-scores, heat index, CPCB AQI, modifiers, levels.

No I/O, no clock, no randomness: same input, same output. All numbers come
from risk_config (see docs/risk-engine.md for sources).
"""

import math
from collections.abc import Iterable

from app.services.risk import risk_config as cfg
from app.services.risk.risk_config import Breakpoints, FactorName, LevelName


def interpolate(breakpoints: Breakpoints, x: float) -> float:
    """Piecewise-linear interpolation, clamped to the first/last output value."""
    if x <= breakpoints[0][0]:
        return breakpoints[0][1]
    for (x0, y0), (x1, y1) in zip(breakpoints, breakpoints[1:], strict=False):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return breakpoints[-1][1]


# ---- Air quality (CPCB National AQI) ----


def aqi_subindex(concentration: float, breakpoints: Breakpoints) -> float:
    """CPCB sub-index for one pollutant (µg/m³), capped at AQI 500."""
    return min(interpolate(breakpoints, max(concentration, 0.0)), cfg.AQI_MAX)


def cpcb_aqi(pm2_5: float | None, pm10: float | None) -> tuple[float, str] | None:
    """AQI = the higher PM sub-index. Returns (aqi, dominant pollutant) or None."""
    candidates = []
    if pm2_5 is not None:
        candidates.append((aqi_subindex(pm2_5, cfg.AQI_PM25_BREAKPOINTS), "pm2_5"))
    if pm10 is not None:
        candidates.append((aqi_subindex(pm10, cfg.AQI_PM10_BREAKPOINTS), "pm10"))
    return max(candidates) if candidates else None


def aqi_category(aqi: float) -> str:
    for upper, name in cfg.AQI_CATEGORIES:
        if aqi <= upper:
            return name
    return cfg.AQI_CATEGORIES[-1][1]


def air_subscore(aqi: float) -> float:
    return interpolate(cfg.AIR_SUBSCORE_BREAKPOINTS, aqi)


# ---- Heat (NOAA heat index) ----


def _c_to_f(c: float) -> float:
    return c * 9.0 / 5.0 + 32.0


def _f_to_c(f: float) -> float:
    return (f - 32.0) * 5.0 / 9.0


def heat_index_f(temperature_f: float, rh: float) -> float:
    """NOAA NWS heat index (°F): simple formula, else Rothfusz regression + adjustments."""
    a, b, c, d = cfg.HI_SIMPLE
    simple = 0.5 * (temperature_f + a + (temperature_f - b) * c + rh * d)
    if (simple + temperature_f) / 2.0 < cfg.HI_SIMPLE_THRESHOLD_F:
        return simple

    c1, c2, c3, c4, c5, c6, c7, c8, c9 = cfg.HI_ROTHFUSZ
    t, r = temperature_f, rh
    hi = c1 + c2 * t + c3 * r + c4 * t * r + c5 * t * t + c6 * r * r + c7 * t * t * r + c8 * t * r * r + c9 * t * t * r * r

    low, high = cfg.HI_LOW_RH_ADJ, cfg.HI_HIGH_RH_ADJ
    if r < low["rh_below"] and low["t_min_f"] <= t <= low["t_max_f"]:
        hi -= ((low["rh_below"] - r) / 4.0) * math.sqrt((17.0 - abs(t - 95.0)) / 17.0)
    elif r > high["rh_above"] and high["t_min_f"] <= t <= high["t_max_f"]:
        hi += ((r - high["rh_above"]) / 10.0) * ((high["t_max_f"] - t) / 5.0)
    return hi


def heat_index_c(temperature_c: float, rh: float) -> float:
    return _f_to_c(heat_index_f(_c_to_f(temperature_c), rh))


def heat_metric_c(temperature_c: float, rh: float | None) -> tuple[float, str]:
    """max(heat index, air temperature); air temperature alone if humidity is missing."""
    if rh is None:
        return temperature_c, "air_temperature"
    return max(heat_index_c(temperature_c, rh), temperature_c), "heat_index"


def heat_subscore(heat_metric: float) -> float:
    return interpolate(cfg.HEAT_SUBSCORE_BREAKPOINTS, heat_metric)


# ---- Cold, swing, UV, altitude ----


def cold_subscore(temperature_c: float) -> float:
    return interpolate(cfg.COLD_SUBSCORE_BREAKPOINTS, temperature_c)


def swing_subscore(swing_c: float) -> float:
    return interpolate(cfg.SWING_SUBSCORE_BREAKPOINTS, swing_c)


def uv_subscore(uv_index: float) -> float:
    if uv_index < cfg.UV_LOW_BELOW:
        return 0.0
    return interpolate(cfg.UV_SUBSCORE_BREAKPOINTS, uv_index)


def altitude_subscore(elevation_m: float) -> float:
    return interpolate(cfg.ALTITUDE_SUBSCORE_BREAKPOINTS, elevation_m)


# ---- Personalisation ----


def age_modifier(age: int) -> float:
    modifier = cfg.AGE_MODIFIERS[0][1]
    for min_age, value in cfg.AGE_MODIFIERS:
        if age >= min_age:
            modifier = value
    return modifier


def condition_multipliers(conditions: Iterable[str]) -> tuple[dict[FactorName, float], list[str]]:
    """Largest multiplier per factor across the member's conditions (no stacking).

    Returns (multiplier per factor, unknown condition codes).
    """
    multipliers: dict[FactorName, float] = {f: 1.0 for f in cfg.FACTORS}
    unknown: list[str] = []
    for condition in conditions:
        table = cfg.CONDITION_MULTIPLIERS.get(condition)
        if table is None:
            unknown.append(condition)
            continue
        for factor, value in table.items():
            multipliers[factor] = max(multipliers[factor], value)
    return multipliers, unknown


def combine(
    subscores: dict[FactorName, float], multipliers: dict[FactorName, float], age_mod: float, sensitivity: float
) -> tuple[int, dict[FactorName, float], dict[FactorName, float]]:
    """score = 100 * min(1, k * a * sum(w * s)); returns (score, weights, contribution %)."""
    weights = {f: cfg.BASE_WEIGHTS[f] * multipliers.get(f, 1.0) for f in subscores}
    weighted = {f: weights[f] * s for f, s in subscores.items()}
    raw = sum(weighted.values())
    total = sensitivity * age_mod * raw
    score = int(math.floor(100.0 * min(1.0, max(0.0, total)) + 0.5))  # round half up
    if raw > 0:
        contributions = {f: 100.0 * v / raw for f, v in weighted.items()}
    else:
        contributions = {f: 0.0 for f in subscores}
    return score, weights, contributions


def level_for(score: float) -> LevelName:
    level = cfg.LEVELS[0][1]
    for lower, name in cfg.LEVELS:
        if score >= lower:
            level = name
    return level


def level_index(level: LevelName) -> int:
    return cfg.LEVEL_ORDER.index(level)
