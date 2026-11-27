"""All thresholds, weights and modifiers of the Climate Health Risk Engine.

Every number used by the scoring functions lives here, with its source.
Values marked "design choice" are not from a published source and must be
reviewed by a doctor before the user study (see docs/risk-engine.md).

Change ENGINE_VERSION whenever any value or formula changes.
"""

from typing import Final, Literal

ENGINE_VERSION: Final = "1.0.0"

Breakpoints = tuple[tuple[float, float], ...]  # (input value, output value), ascending inputs

FactorName = Literal["air_quality", "heat", "cold", "temperature_swing", "uv", "altitude"]
FACTORS: Final[tuple[FactorName, ...]] = ("air_quality", "heat", "cold", "temperature_swing", "uv", "altitude")

# ---------------------------------------------------------------------------
# Air quality: CPCB National Air Quality Index (2014), Central Pollution
# Control Board, MoEFCC, India. (concentration µg/m³, AQI) breakpoints.
# Upper bounds of "Severe" (380 / 510) as used by the CPCB AQI calculator;
# official table gaps (30 -> 31) closed with each band's upper bound.
# ---------------------------------------------------------------------------
AQI_PM25_BREAKPOINTS: Final[Breakpoints] = (
    (0, 0), (30, 50), (60, 100), (90, 200), (120, 300), (250, 400), (380, 500),
)
AQI_PM10_BREAKPOINTS: Final[Breakpoints] = (
    (0, 0), (50, 50), (100, 100), (250, 200), (350, 300), (430, 400), (510, 500),
)
AQI_MAX: Final = 500.0
# CPCB: a 24-hour average needs at least 16 hourly values.
AQI_MIN_HOURS_FOR_24H_MEAN: Final = 16
AQI_AVERAGING_HOURS: Final = 24
AQI_CATEGORIES: Final[tuple[tuple[float, str], ...]] = (  # (upper AQI bound, CPCB category)
    (50, "Good"), (100, "Satisfactory"), (200, "Moderately polluted"),
    (300, "Poor"), (400, "Very poor"), (500, "Severe"),
)
# AQI -> sub-score. Design choice aligned to CPCB health statements per category.
AIR_SUBSCORE_BREAKPOINTS: Final[Breakpoints] = (
    (0, 0.0), (50, 0.05), (100, 0.15), (200, 0.40), (300, 0.60), (400, 0.80), (500, 1.0),
)

# ---------------------------------------------------------------------------
# Heat: NOAA NWS "The Heat Index Equation" (Rothfusz regression + adjustments),
# Weather Prediction Center. Coefficients for °F.
# ---------------------------------------------------------------------------
HI_SIMPLE = (61.0, 68.0, 1.2, 0.094)  # 0.5*(T + 61 + (T-68)*1.2 + RH*0.094)
HI_SIMPLE_THRESHOLD_F: Final = 80.0  # use the simple formula if mean(HI_simple, T) < 80 °F
HI_ROTHFUSZ: Final = (
    -42.379, 2.04901523, 10.14333127, -0.22475541, -0.00683783,
    -0.05481717, 0.00122874, 0.00085282, -0.00000199,
)
HI_LOW_RH_ADJ: Final = {"rh_below": 13.0, "t_min_f": 80.0, "t_max_f": 112.0}
HI_HIGH_RH_ADJ: Final = {"rh_above": 85.0, "t_min_f": 80.0, "t_max_f": 87.0}
# Heat metric (°C) = max(heat index, air temperature) -> sub-score.
# 27/32/39/52 °C: NOAA NWS heat index categories (80/90/103/125 °F);
# 39 °C ~ IMD heat-wave criterion for plains (max >= 40 °C);
# 45 °C: IMD heat wave regardless of normal (actual max >= 45 °C);
# NDMA Heat Wave Action Plan Guidelines (2019).
HEAT_SUBSCORE_BREAKPOINTS: Final[Breakpoints] = (
    (27.0, 0.0), (32.0, 0.20), (39.0, 0.50), (45.0, 0.80), (52.0, 1.0),
)

# ---------------------------------------------------------------------------
# Cold: anchor temperatures from IMD cold-wave criteria (plains: considered when
# min <= 10 °C, cold wave when actual min <= 4 °C, severe <= 2 °C; hills: min
# <= 0 °C); NDMA Cold Wave Guidelines (2021). IMD defines these on the daily
# MINIMUM; we apply them to each hour's air temperature, so the sub-scores are
# kept moderate (a 5 °C afternoon is not a cold wave). Sub-score values and the
# 15 °C / -10 °C / -20 °C anchors are design choices.
# Air temperature (°C) -> sub-score (ascending temperatures, descending scores).
# ---------------------------------------------------------------------------
COLD_SUBSCORE_BREAKPOINTS: Final[Breakpoints] = (
    (-20.0, 1.0), (-10.0, 0.85), (0.0, 0.60), (2.0, 0.50), (4.0, 0.40), (10.0, 0.15), (15.0, 0.0),
)

# ---------------------------------------------------------------------------
# Temperature swing: max - min hourly temperature over the next 24 h (°C).
# Design choice informed by Cheng et al. 2014 (Int J Biometeorol, DTR systematic
# review) and Lim et al. 2012 (Environ Health Perspect).
# ---------------------------------------------------------------------------
SWING_WINDOW_HOURS: Final = 24
SWING_SUBSCORE_BREAKPOINTS: Final[Breakpoints] = ((8.0, 0.0), (10.0, 0.20), (15.0, 0.50), (20.0, 1.0))

# ---------------------------------------------------------------------------
# UV: WHO "Global Solar UV Index: A Practical Guide" (2002):
# Low 0-2, Moderate 3-5, High 6-7, Very high 8-10, Extreme 11+.
# ---------------------------------------------------------------------------
UV_LOW_BELOW: Final = 3.0  # UV < 3 -> sub-score 0
UV_SUBSCORE_BREAKPOINTS: Final[Breakpoints] = ((3.0, 0.20), (6.0, 0.50), (8.0, 0.75), (11.0, 1.0))

# ---------------------------------------------------------------------------
# Altitude (travel context only): Wilderness Medical Society guidelines (Luks
# et al., 2019 update); CDC Yellow Book "High-Altitude Travel": risk above
# ~2,500 m; very high 3,500-5,500 m; extreme > 5,500 m.
# ---------------------------------------------------------------------------
ALTITUDE_SUBSCORE_BREAKPOINTS: Final[Breakpoints] = ((2500.0, 0.0), (3500.0, 0.60), (5500.0, 1.0))

# ---------------------------------------------------------------------------
# Personalisation: score = 100 * min(1, k * a * sum(w_f * s_f)).
# All weights, multipliers and age modifiers are design choices.
# Calibration: one factor at its maximum gives a healthy adult (k=a=1) 15-75,
# leaving headroom so condition and age modifiers still change the level
# (v1.0.0 demo: healthy adult in severe smog ~70, child ~80, heart patient 100).
# ---------------------------------------------------------------------------
BASE_WEIGHTS: Final[dict[FactorName, float]] = {
    "air_quality": 0.65,
    "heat": 0.75,
    "cold": 0.55,
    "temperature_swing": 0.15,
    "uv": 0.25,
    "altitude": 0.50,
}

# Per-factor multipliers; for several conditions the LARGEST multiplier per factor
# is used (no stacking). Pathways: GINA 2024 (asthma), GOLD 2024 (COPD), AHA
# statement Brook et al. 2010 + WHO heat & health (heart disease), CDC/WHO heat &
# health (diabetes), WHO heat & health + NDMA heat-wave guidelines (pregnancy).
CONDITION_MULTIPLIERS: Final[dict[str, dict[FactorName, float]]] = {
    "none": {},
    "asthma": {"air_quality": 1.5, "heat": 1.1, "cold": 1.3, "temperature_swing": 1.2, "altitude": 1.2},
    "copd": {"air_quality": 1.6, "heat": 1.2, "cold": 1.4, "temperature_swing": 1.2, "altitude": 1.5},
    "heart_disease": {"air_quality": 1.4, "heat": 1.4, "cold": 1.4, "temperature_swing": 1.2, "altitude": 1.4},
    "diabetes": {"air_quality": 1.1, "heat": 1.3, "cold": 1.1},
    "pregnancy": {"air_quality": 1.2, "heat": 1.3, "altitude": 1.3},
}

# Age modifier a: (minimum age, modifier), ascending. WHO heat-health guidance,
# NDMA heat-wave guidelines and CPCB AQI health statements name young children
# and older adults as vulnerable; the values are design choices.
AGE_MODIFIERS: Final[tuple[tuple[int, float], ...]] = ((0, 1.30), (5, 1.15), (12, 1.00), (65, 1.20), (75, 1.35))

# ---------------------------------------------------------------------------
# Levels (lower bound of each level, ascending).
# ---------------------------------------------------------------------------
LevelName = Literal["Low", "Moderate", "High", "Very High", "Dangerous"]
LEVELS: Final[tuple[tuple[int, LevelName], ...]] = (
    (0, "Low"), (20, "Moderate"), (40, "High"), (60, "Very High"), (80, "Dangerous"),
)
LEVEL_ORDER: Final[tuple[LevelName, ...]] = tuple(name for _, name in LEVELS)

# ---------------------------------------------------------------------------
# Forecast, safe windows, routines.
# ---------------------------------------------------------------------------
DEFAULT_SAFE_BELOW: Final[LevelName] = "High"  # safe = Low or Moderate
DEFAULT_FORECAST_HOURS: Final = 48
DEFAULT_SAFE_WINDOW_HOURS: Final = 24
TOP_FACTORS: Final = 3
# Use the snapshot's "current" values if at_time is within this many minutes of them.
CURRENT_OBSERVATION_TOLERANCE_MINUTES: Final = 60
