"""Three profiles x four scenarios (saved fixtures, no network): levels must be sensible.

Scenarios: Delhi recorded live data (27 Nov 2026), synthetic Delhi winter smog,
synthetic Delhi summer heatwave, Leh recorded live data assessed as a trip.
"""

import pytest

from app.services.risk import assess, hourly_assessment
from app.services.risk import factors as fx
from tests.unit.risk.helpers import AARAV, HEALTHY, PAPA, PRIYA, load_scenario

pytestmark = pytest.mark.unit

FAMILY = (PRIYA, AARAV, PAPA)
SCENARIOS = {
    "delhi_recorded": "home",
    "delhi_winter_smog": "home",
    "delhi_summer_heatwave": "home",
    "leh_recorded": "travel",
}


def level_at_least(level: str, minimum: str) -> bool:
    return fx.level_index(level) >= fx.level_index(minimum)


@pytest.fixture(scope="module")
def results():
    out = {}
    for name, context in SCENARIOS.items():
        snap = load_scenario(name)
        out[name] = {m.name: assess(m, snap, context=context) for m in (HEALTHY, *FAMILY)}
    return out


@pytest.mark.parametrize("scenario", SCENARIOS)
def test_every_member_scores_at_least_the_healthy_adult(results, scenario):
    r = results[scenario]
    for member in FAMILY:
        assert r[member.name].score >= r["Healthy adult"].score, (scenario, member.name)


@pytest.mark.parametrize("scenario", SCENARIOS)
def test_contributions_sum_to_100_for_every_member(results, scenario):
    for assessment in results[scenario].values():
        assert sum(assessment.contributions.values()) == pytest.approx(100, abs=0.05)


def test_winter_smog_child_and_elderly_higher_than_healthy_adult(results):
    r = results["delhi_winter_smog"]
    assert r["Aarav"].score > r["Healthy adult"].score
    assert r["Papa"].score > r["Healthy adult"].score
    assert r["Priya"].score > r["Healthy adult"].score
    assert level_at_least(r["Healthy adult"].level, "Very High")  # CPCB "Severe" air
    assert all(a.top_factors[0] == "air_quality" for a in r.values())
    assert r["Papa"].level == "Dangerous" and r["Priya"].level == "Dangerous"


def test_summer_heatwave_heat_is_the_top_factor_and_dangerous_for_papa(results):
    r = results["delhi_summer_heatwave"]
    assert all(a.top_factors[0] == "heat" for a in r.values())
    assert r["Papa"].level == "Dangerous"
    assert r["Papa"].inputs["heat_metric_c"] >= 44


def test_delhi_recorded_air_dominates_and_conditions_raise_the_score(results):
    r = results["delhi_recorded"]
    assert all(a.top_factors[0] == "air_quality" for a in r.values())
    assert r["Papa"].score > r["Healthy adult"].score and r["Priya"].score > r["Healthy adult"].score
    assert r["Aarav"].score > r["Healthy adult"].score


def test_papa_is_flagged_at_leh_altitude(results):
    papa = results["leh_recorded"]["Papa"]
    assert level_at_least(papa.level, "Very High")
    assert "altitude" in papa.top_factors
    assert papa.inputs["elevation_m"] > 3000  # fine elevation grid: ~3411 m, not the 3742 m cell centre
    assert results["leh_recorded"]["Papa"].score > results["leh_recorded"]["Healthy adult"].score


def test_altitude_is_trip_level_not_part_of_hourly_scores():
    snap = load_scenario("leh_recorded")
    travel_hourly = hourly_assessment(PAPA, snap, hours=24, context="travel")
    home_hourly = hourly_assessment(PAPA, snap, hours=24, context="home")
    assert [h.score for h in travel_hourly] == [h.score for h in home_hourly]
    assert all("altitude" not in h.top_factors for h in travel_hourly)

    travel = assess(PAPA, snap, context="travel")
    assert travel.altitude.applied is True and travel.altitude.elevation_m == travel.inputs["elevation_m"]
    altitude_factor = next(f for f in travel.factors if f.factor == "altitude")
    assert travel.altitude.sub_score == pytest.approx(altitude_factor.sub_score)
    assert "not part of hourly scores" in travel.altitude.note


def test_altitude_reported_but_not_applied_at_home():
    home = assess(PAPA, load_scenario("leh_recorded"))
    assert home.altitude.applied is False and home.altitude.sub_score > 0
    assert "altitude" not in home.contributions


def test_leh_without_travel_context_does_not_apply_altitude():
    snap = load_scenario("leh_recorded")
    home, travel = assess(PAPA, snap), assess(PAPA, snap, context="travel")
    assert "altitude" not in home.contributions and travel.score > home.score


def test_heatwave_night_is_less_risky_than_afternoon():
    snap = load_scenario("delhi_summer_heatwave")
    hourly = hourly_assessment(PAPA, snap, hours=24)
    assert min(h.score for h in hourly) < max(h.score for h in hourly)


@pytest.mark.parametrize("scenario", ["delhi_winter_smog", "delhi_summer_heatwave"])
def test_synthetic_scenarios_are_labelled(scenario):
    assert any("SYNTHETIC" in w for w in load_scenario(scenario).warnings)
