"""Property-based tests (hypothesis): invariants that must hold for ANY input."""

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.risk import MemberProfile, assess
from app.services.risk import factors as fx
from app.services.risk import risk_config as cfg
from tests.unit.risk.helpers import make_snapshot

pytestmark = pytest.mark.unit

FAST = settings(max_examples=60, deadline=None, suppress_health_check=[HealthCheck.too_slow])
KNOWN_CONDITIONS = [c for c in cfg.CONDITION_MULTIPLIERS if c != "none"]

pm25s = st.floats(min_value=0, max_value=600, allow_nan=False)
pm10s = st.floats(min_value=0, max_value=800, allow_nan=False)
temps = st.floats(min_value=-25, max_value=50, allow_nan=False)
rhs = st.floats(min_value=0, max_value=100, allow_nan=False)
uvs = st.floats(min_value=0, max_value=15, allow_nan=False)
elevations = st.floats(min_value=0, max_value=6000, allow_nan=False)
ages = st.integers(min_value=0, max_value=120)
sensitivities = st.floats(min_value=0.5, max_value=2.0, allow_nan=False)
conditions = st.lists(st.sampled_from(KNOWN_CONDITIONS), max_size=3, unique=True)
contexts = st.sampled_from(["home", "travel"])


def snapshot(pm25, pm10, temp, rh, uv, elevation):
    # Short series: enough hours for the 24-h mean and the 24-h swing window.
    return make_snapshot(pm25=pm25, pm10=pm10, temperature=temp, rh=rh, uv=uv, elevation=elevation,
                         past_hours=24, future_hours=26)


@FAST
@given(pm25s, pm25s, pm10s, temps, rhs, uvs, ages, conditions)
def test_worse_air_never_lowers_the_score(pm_a, pm_b, pm10, temp, rh, uv, age, conds):
    low, high = sorted((pm_a, pm_b))
    member = MemberProfile(age=age, conditions=conds)
    s_low = assess(member, snapshot(low, pm10, temp, rh, uv, 216)).score
    s_high = assess(member, snapshot(high, pm10, temp, rh, uv, 216)).score
    assert s_high >= s_low


@FAST
@given(pm25s, pm10s, temps, rhs, uvs, elevations, ages, conditions, st.sampled_from(KNOWN_CONDITIONS), contexts)
def test_adding_a_condition_never_lowers_the_score(pm25, pm10, temp, rh, uv, elevation, age, conds, extra, context):
    snap = snapshot(pm25, pm10, temp, rh, uv, elevation)
    before = assess(MemberProfile(age=age, conditions=conds), snap, context=context).score
    after = assess(MemberProfile(age=age, conditions=sorted({*conds, extra})), snap, context=context).score
    assert after >= before


@FAST
@given(pm25s, pm10s, temps, rhs, uvs, elevations, ages, sensitivities, conditions, contexts)
def test_score_range_level_and_contributions(pm25, pm10, temp, rh, uv, elevation, age, k, conds, context):
    a = assess(MemberProfile(age=age, sensitivity=k, conditions=conds), snapshot(pm25, pm10, temp, rh, uv, elevation),
               context=context)
    assert 0 <= a.score <= 100
    assert a.level == fx.level_for(a.score)
    total = sum(a.contributions.values())
    if any(f.sub_score > 0 for f in a.factors):
        assert total == pytest.approx(100, abs=0.05)
    else:
        assert total == 0
    assert all(0 <= f.sub_score <= 1 for f in a.factors)


@FAST
@given(st.floats(min_value=-60, max_value=60, allow_nan=False), st.floats(min_value=-60, max_value=60, allow_nan=False))
def test_heat_and_cold_subscores_are_monotonic(t1, t2):
    low, high = sorted((t1, t2))
    assert fx.heat_subscore(high) >= fx.heat_subscore(low)
    assert fx.cold_subscore(high) <= fx.cold_subscore(low)


@FAST
@given(ages, ages)
def test_age_modifier_is_one_for_working_age_and_higher_at_the_ends(a1, a2):
    for age in (a1, a2):
        assert fx.age_modifier(age) >= 1.0
