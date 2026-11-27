"""Factor functions: boundaries at every breakpoint, NOAA heat index, modifiers, levels."""

import pytest

from app.services.risk import factors as fx
from app.services.risk import risk_config as cfg

pytestmark = pytest.mark.unit
approx = pytest.approx


# ---- interpolation ----


def test_interpolate_clamps_and_is_linear():
    bp = ((0.0, 0.0), (10.0, 1.0), (20.0, 3.0))
    assert fx.interpolate(bp, -5) == 0.0
    assert fx.interpolate(bp, 5) == 0.5
    assert fx.interpolate(bp, 15) == 2.0
    assert fx.interpolate(bp, 99) == 3.0


# ---- CPCB AQI ----


@pytest.mark.parametrize(
    ("pm25", "aqi"), [(0, 0), (30, 50), (60, 100), (90, 200), (120, 300), (250, 400), (380, 500), (900, 500)]
)
def test_pm25_subindex_at_every_cpcb_breakpoint(pm25, aqi):
    assert fx.aqi_subindex(pm25, cfg.AQI_PM25_BREAKPOINTS) == approx(aqi)


@pytest.mark.parametrize(
    ("pm10", "aqi"), [(0, 0), (50, 50), (100, 100), (250, 200), (350, 300), (430, 400), (510, 500), (2000, 500)]
)
def test_pm10_subindex_at_every_cpcb_breakpoint(pm10, aqi):
    assert fx.aqi_subindex(pm10, cfg.AQI_PM10_BREAKPOINTS) == approx(aqi)


@pytest.mark.parametrize(("pm25", "aqi"), [(15, 25), (45, 75), (75, 150), (185, 350)])
def test_pm25_subindex_interpolates_inside_bands(pm25, aqi):
    assert fx.aqi_subindex(pm25, cfg.AQI_PM25_BREAKPOINTS) == approx(aqi)


def test_aqi_is_the_higher_sub_index():
    assert fx.cpcb_aqi(45, 300) == (approx(250), "pm10")
    aqi, pollutant = fx.cpcb_aqi(200, 100)
    assert pollutant == "pm2_5" and aqi == approx(300 + (200 - 120) * 100 / 130)
    assert fx.cpcb_aqi(None, 75)[1] == "pm10"
    assert fx.cpcb_aqi(None, None) is None


@pytest.mark.parametrize(
    ("aqi", "category"),
    [(0, "Good"), (50, "Good"), (50.1, "Satisfactory"), (100, "Satisfactory"), (100.1, "Moderately polluted"),
     (200, "Moderately polluted"), (200.1, "Poor"), (300, "Poor"), (300.1, "Very poor"), (400, "Very poor"),
     (400.1, "Severe"), (500, "Severe")],
)
def test_aqi_category_boundaries(aqi, category):
    assert fx.aqi_category(aqi) == category


@pytest.mark.parametrize(("aqi", "sub"), [(0, 0), (50, 0.05), (100, 0.15), (200, 0.40), (300, 0.60), (400, 0.80), (500, 1.0)])
def test_air_subscore_at_breakpoints(aqi, sub):
    assert fx.air_subscore(aqi) == approx(sub)


# ---- NOAA heat index ----

# (T °F, RH %, NWS heat index chart value °F). The regression is within ~±1.3 °F
# of the chart, which itself is rounded to whole degrees.
NOAA_CHART = [
    (80, 40, 80), (90, 40, 91), (90, 50, 95), (90, 60, 100), (90, 70, 106), (90, 80, 113),
    (100, 40, 109), (86, 90, 105), (96, 50, 108), (104, 40, 119), (70, 50, 69),
]


@pytest.mark.parametrize(("t", "rh", "expected"), NOAA_CHART)
def test_heat_index_matches_noaa_reference_values(t, rh, expected):
    assert fx.heat_index_f(t, rh) == approx(expected, abs=0.6)


def test_simple_formula_is_used_below_80F():
    t, rh = 70.0, 50.0
    assert fx.heat_index_f(t, rh) == approx(0.5 * (t + 61 + (t - 68) * 1.2 + rh * 0.094))


def test_low_humidity_adjustment_lowers_the_index():
    t, rh = 100.0, 10.0
    c1, c2, c3, c4, c5, c6, c7, c8, c9 = cfg.HI_ROTHFUSZ
    unadjusted = c1 + c2*t + c3*rh + c4*t*rh + c5*t*t + c6*rh*rh + c7*t*t*rh + c8*t*rh*rh + c9*t*t*rh*rh
    assert fx.heat_index_f(t, rh) < unadjusted


def test_high_humidity_adjustment_raises_the_index():
    t, rh = 84.0, 95.0
    c1, c2, c3, c4, c5, c6, c7, c8, c9 = cfg.HI_ROTHFUSZ
    unadjusted = c1 + c2*t + c3*rh + c4*t*rh + c5*t*t + c6*rh*rh + c7*t*t*rh + c8*t*rh*rh + c9*t*t*rh*rh
    assert fx.heat_index_f(t, rh) > unadjusted


def test_heat_index_celsius_round_trip():
    assert fx.heat_index_c(32.2222, 50) == approx((95 - 32) * 5 / 9, abs=0.4)  # 90 °F / 50 % -> ~95 °F


def test_heat_metric_takes_max_of_index_and_air_temperature():
    metric, basis = fx.heat_metric_c(44.0, 10.0)  # very dry: HI below T
    assert basis == "heat_index" and metric >= 44.0
    assert fx.heat_metric_c(30.0, None) == (30.0, "air_temperature")


@pytest.mark.parametrize(("c", "sub"), [(20, 0), (27, 0), (32, 0.20), (39, 0.50), (45, 0.80), (52, 1.0), (60, 1.0)])
def test_heat_subscore_at_breakpoints(c, sub):
    assert fx.heat_subscore(c) == approx(sub)


# ---- cold, swing, UV, altitude ----


@pytest.mark.parametrize(
    ("c", "sub"), [(20, 0), (15, 0), (10, 0.15), (4, 0.40), (2, 0.50), (0, 0.60), (-10, 0.85), (-20, 1.0), (-40, 1.0)]
)
def test_cold_subscore_at_imd_breakpoints(c, sub):
    assert fx.cold_subscore(c) == approx(sub)


@pytest.mark.parametrize(("swing", "sub"), [(0, 0), (8, 0), (10, 0.20), (15, 0.50), (20, 1.0), (30, 1.0)])
def test_swing_subscore_at_breakpoints(swing, sub):
    assert fx.swing_subscore(swing) == approx(sub)


@pytest.mark.parametrize(
    ("uv", "sub"), [(0, 0), (2.99, 0), (3, 0.20), (6, 0.50), (8, 0.75), (11, 1.0), (15, 1.0)]
)
def test_uv_subscore_at_who_breakpoints(uv, sub):
    assert fx.uv_subscore(uv) == approx(sub)


@pytest.mark.parametrize(("m", "sub"), [(0, 0), (2499, 0), (2500, 0), (3000, 0.30), (3500, 0.60), (5500, 1.0), (8000, 1.0)])
def test_altitude_subscore_at_breakpoints(m, sub):
    assert fx.altitude_subscore(m) == approx(sub)


# ---- personalisation ----


@pytest.mark.parametrize(
    ("age", "a"), [(0, 1.30), (4, 1.30), (5, 1.15), (11, 1.15), (12, 1.0), (64, 1.0), (65, 1.20), (74, 1.20),
                   (75, 1.35), (120, 1.35)]
)
def test_age_modifier_boundaries(age, a):
    assert fx.age_modifier(age) == a


def test_multiple_conditions_take_the_largest_multiplier_per_factor():
    multipliers, unknown = fx.condition_multipliers(["asthma", "diabetes"])
    assert multipliers["air_quality"] == 1.5  # asthma
    assert multipliers["heat"] == 1.3  # diabetes
    assert multipliers["uv"] == 1.0
    assert unknown == []


def test_unknown_conditions_are_ignored_and_reported():
    multipliers, unknown = fx.condition_multipliers(["asthma", "made_up"])
    assert unknown == ["made_up"] and multipliers["air_quality"] == 1.5


def test_combine_applies_the_spec_formula():
    subscores = {"air_quality": 0.5, "uv": 0.2}
    multipliers = {"air_quality": 1.5, "uv": 1.0}
    score, weights, contributions = fx.combine(subscores, multipliers, age_mod=1.15, sensitivity=1.2)
    raw = 0.65 * 1.5 * 0.5 + 0.25 * 0.2
    assert score == round(100 * 1.2 * 1.15 * raw)
    assert weights == {"air_quality": approx(0.975), "uv": approx(0.25)}
    assert sum(contributions.values()) == approx(100)
    assert contributions["air_quality"] == approx(100 * 0.975 * 0.5 / raw)


def test_combine_caps_at_100_and_handles_zero():
    assert fx.combine({"heat": 1.0, "air_quality": 1.0}, {}, 1.35, 2.0)[0] == 100
    score, _, contributions = fx.combine({"heat": 0.0}, {}, 1.0, 1.0)
    assert score == 0 and contributions == {"heat": 0.0}


@pytest.mark.parametrize(
    ("score", "level"),
    [(0, "Low"), (19, "Low"), (20, "Moderate"), (39, "Moderate"), (40, "High"), (59, "High"), (60, "Very High"),
     (79, "Very High"), (80, "Dangerous"), (100, "Dangerous")],
)
def test_level_boundaries(score, level):
    assert fx.level_for(score) == level


def test_engine_version_is_semver():
    major, minor, patch = cfg.ENGINE_VERSION.split(".")
    assert all(part.isdigit() for part in (major, minor, patch))
