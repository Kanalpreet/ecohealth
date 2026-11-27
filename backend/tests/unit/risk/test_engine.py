"""assess(): inputs used, AQI basis, missing data, context, sources, determinism."""

import uuid
from datetime import timedelta

import pytest

from app.models import FamilyMember
from app.services.risk import ENGINE_VERSION, MemberProfile, assess
from app.services.risk import factors as fx
from tests.unit.risk.helpers import HEALTHY, PAPA, PRIYA, T0, make_snapshot

pytestmark = pytest.mark.unit
approx = pytest.approx


def test_assessment_reports_score_level_factors_and_inputs():
    snap = make_snapshot(pm25=137.0, pm10=139.0, temperature=23.6, rh=40, uv=2.4)
    a = assess(PRIYA, snap)
    assert a.engine_version == ENGINE_VERSION and a.context == "home"
    assert a.level == fx.level_for(a.score)
    assert [f.factor for f in a.factors] == ["air_quality", "heat", "cold", "temperature_swing", "uv"]
    assert a.inputs["aqi_basis"] == "24h_mean" and a.inputs["aqi_category"] == "Very poor"
    assert a.inputs["pm2_5"] == 137.0 and a.inputs["weather_basis"] == "current"
    assert sum(a.contributions.values()) == approx(100, abs=0.05)
    assert a.top_factors == ["air_quality"]  # every other factor is 0 here
    assert a.condition_multipliers["air_quality"] == 1.5 and a.age_modifier == 1.0


def test_air_quality_uses_24h_mean_when_16_hours_exist():
    # Last 24 h: 8 h at 300 and 16 h at 0 -> mean 100 (not the current 300).
    snap = make_snapshot(pm25=lambda t: 300.0 if t > T0 - timedelta(hours=8) else 0.0, pm10=None)
    a = assess(HEALTHY, snap)
    assert a.inputs["aqi_basis"] == "24h_mean"
    assert a.inputs["pm2_5"] == approx(100.0)


def test_air_quality_falls_back_to_hourly_value_with_too_few_hours():
    snap = make_snapshot(pm25=lambda t: 80.0 if t >= T0 - timedelta(hours=9) else None, pm10=None)
    a = assess(HEALTHY, snap)
    assert a.inputs["aqi_basis"] == "hourly_indicative" and a.inputs["pm2_5"] == 80.0
    assert any("fewer than 16 hourly values" in w for w in a.warnings)


def test_later_at_time_uses_the_hourly_forecast_point():
    snap = make_snapshot(temperature=lambda t: 40.0 if t >= T0 + timedelta(hours=5) else 20.0)
    later = assess(HEALTHY, snap, at_time=T0 + timedelta(hours=5, minutes=20))
    assert later.inputs["weather_basis"] == "hourly" and later.inputs["temperature_c"] == 40.0
    assert assess(HEALTHY, snap).inputs["temperature_c"] == 20.0


def test_missing_weather_is_excluded_and_reported_not_zero():
    snap = make_snapshot(weather=False, pm25=100.0)
    a = assess(HEALTHY, snap)
    missing = {m.factor: m.reason for m in a.missing_factors}
    assert set(missing) == {"heat", "cold", "uv", "temperature_swing"}
    assert "open-meteo-weather unavailable (unavailable: timeout after 3 attempts)" in missing["heat"]
    # Missing factors are absent (not present with value 0): reported, and not part of the shares.
    assert [f.factor for f in a.factors] == ["air_quality"]
    assert a.contributions == {"air_quality": 100.0}
    assert "temperature_c" not in a.inputs


def test_missing_air_quality_is_excluded_and_reported():
    a = assess(HEALTHY, make_snapshot(air=False, temperature=44, rh=20))
    assert [m.factor for m in a.missing_factors] == ["air_quality"]
    assert "air_quality" not in a.contributions
    assert a.score > 0  # heat still counts


def test_missing_humidity_uses_air_temperature_for_heat():
    a = assess(HEALTHY, make_snapshot(temperature=40, rh=None))
    assert a.inputs["heat_basis"] == "air_temperature" and a.inputs["heat_metric_c"] == 40.0


def test_missing_temperature_excludes_heat_and_cold():
    a = assess(HEALTHY, make_snapshot(temperature=None))
    assert {"heat", "cold"} <= {m.factor for m in a.missing_factors}


def test_altitude_applies_only_in_travel_context():
    snap = make_snapshot(elevation=3500.0)
    home = assess(PAPA, snap)
    travel = assess(PAPA, snap, context="travel")
    assert "altitude" not in home.contributions and home.not_applied[0].factor == "altitude"
    assert "altitude" in travel.contributions and travel.score > home.score
    missing = assess(PAPA, make_snapshot(elevation=None), context="travel")
    assert [m.factor for m in missing.missing_factors] == ["altitude"]


def test_data_sources_and_stale_providers_are_reported():
    snap = make_snapshot(sources={"open-meteo-air-quality": "stale", "open-meteo-weather": "cache"})
    a = assess(HEALTHY, snap)
    assert a.data_sources["open-meteo-weather"].source == "cache"
    assert a.stale_providers == ["open-meteo-air-quality"]
    assert any("stale data" in w for w in a.warnings)


def test_unknown_conditions_are_reported():
    a = assess(MemberProfile(age=40, conditions=["asthma", "mystery"]), make_snapshot())
    assert a.unknown_conditions == ["mystery"] and any("mystery" in w for w in a.warnings)


def test_sensitivity_scales_the_score():
    snap = make_snapshot(pm25=120.0)
    low = assess(MemberProfile(age=40, sensitivity=0.5), snap).score
    normal = assess(MemberProfile(age=40), snap).score
    high = assess(MemberProfile(age=40, sensitivity=2.0), snap).score
    assert low < normal < high


def test_assess_is_deterministic():
    snap = make_snapshot(pm25=150.0, temperature=35, rh=60, uv=9)
    assert assess(PRIYA, snap) == assess(PRIYA, snap)


def test_accepts_orm_family_member():
    member = FamilyMember(id=uuid.uuid4(), user_id=uuid.uuid4(), name="Test", age=68, conditions=["heart_disease"],
                          sensitivity=1.0)
    assert assess(member, make_snapshot(pm25=200)).score == assess(PAPA, make_snapshot(pm25=200)).score


def test_no_factor_of_concern_gives_zero_score_and_zero_shares():
    a = assess(HEALTHY, make_snapshot(pm25=0, pm10=0, temperature=22, rh=40, uv=0))
    assert a.score == 0 and a.level == "Low" and a.top_factors == []
    assert all(v == 0 for v in a.contributions.values())
