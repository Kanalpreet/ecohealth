"""Risk read APIs with a recorded Delhi environment snapshot (no live provider calls)."""

from datetime import timedelta

import pytest

from app.api.risk import DISCLAIMER
from app.services.environment.models import EnvironmentSnapshot
from app.services.risk import ENGINE_VERSION
from tests.integration.conftest import new_user

pytestmark = pytest.mark.integration

PRIYA = {"name": "Priya", "age": 34, "conditions": ["asthma"]}
WALK = {"activity": "morning walk", "start_time": "06:30", "days_of_week": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]}


@pytest.fixture
def setup(client):
    _, h = new_user(client)
    client.patch("/me", headers=h, json={"home_lat": 28.61, "home_lon": 77.21, "timezone": "Asia/Kolkata"})
    mid = client.post("/members", headers=h, json=PRIYA).json()["id"]
    client.post(f"/members/{mid}/routines", headers=h, json=WALK)
    return h, mid


def test_no_home_location_returns_409_with_help(client):
    _, h = new_user(client)
    mid = client.post("/members", headers=h, json=PRIYA).json()["id"]
    for path in (f"/members/{mid}/risk", f"/members/{mid}/risk/hourly", "/family/risk"):
        r = client.get(path, headers=h)
        assert r.status_code == 409 and "PATCH /me" in r.json()["detail"], path


def test_member_risk_returns_assessment_contributions_and_sources(client, setup, environment):
    h, mid = setup
    r = client.get(f"/members/{mid}/risk", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["disclaimer"] == DISCLAIMER and "not a diagnostic tool" in body["disclaimer"]
    a = body["assessment"]
    assert a["engine_version"] == ENGINE_VERSION
    assert 0 <= a["score"] <= 100 and a["level"]
    assert a["top_factors"][0] == "air_quality"  # recorded Delhi data: very poor air
    assert abs(sum(a["contributions"].values()) - 100) < 0.1
    assert set(a["data_sources"]) >= {"open-meteo-weather", "open-meteo-air-quality"}
    assert body["location"]["grid_degrees"] == 0.05  # grid cell, not the exact home
    assert environment.calls == [(28.61, 77.21)]


def test_hourly_risk_in_user_timezone_with_routines(client, setup):
    h, mid = setup
    r = client.get(f"/members/{mid}/risk/hourly", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["disclaimer"] == DISCLAIMER and body["timezone"] == "Asia/Kolkata"
    assert len(body["hourly"]) == 24
    assert body["hourly"][0]["time_local"].endswith("+05:30")
    for window in body["safe_windows"]:
        assert window["start_local"].endswith("+05:30") and window["worst_level"] in ("Low", "Moderate")
    (routine,) = body["routines"]
    assert routine["activity"] == "morning walk" and routine["status"] in ("ok", "unsafe")
    assert routine["next_occurrence_local"].endswith("06:30:00+05:30")


def test_family_risk_summary_cards(client, setup):
    h, mid = setup
    aarav = client.post("/members", headers=h, json={"name": "Aarav", "age": 6}).json()["id"]
    r = client.get("/family/risk", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["disclaimer"] == DISCLAIMER and body["timezone"] == "Asia/Kolkata"
    cards = {c["member_id"]: c for c in body["members"]}
    assert set(cards) == {mid, aarav}
    assert cards[mid]["name"] == "Priya" and cards[mid]["level"]
    assert isinstance(cards[mid]["unsafe_routines"], list)
    assert "open-meteo-weather" in body["data_sources"]


def test_no_environmental_data_gives_503_not_a_low_score(client, setup, environment):
    h, mid = setup
    snap = environment.snapshot
    environment.snapshot = EnvironmentSnapshot(
        latitude=snap.latitude, longitude=snap.longitude, generated_at=snap.generated_at,
        failures=[], sources={}, elevation_m=None,
    )
    for path in (f"/members/{mid}/risk", f"/members/{mid}/risk/hourly", "/family/risk"):
        r = client.get(path, headers=h)
        assert r.status_code == 503 and "temporarily unavailable" in r.json()["detail"], path


def test_environment_service_not_started_gives_503(client, setup):
    from app.api.risk import get_environment
    from main import app

    h, mid = setup
    app.dependency_overrides.pop(get_environment)  # real dependency; lifespan not started in tests
    r = client.get(f"/members/{mid}/risk", headers=h)
    assert r.status_code == 503


def test_risk_responses_never_contain_secrets(client, setup):
    h, mid = setup
    for path in (f"/members/{mid}/risk", f"/members/{mid}/risk/hourly", "/family/risk"):
        text = client.get(path, headers=h).text
        assert "argon2" not in text and "password" not in text


def test_stale_snapshot_is_reported(client, setup, environment):
    h, mid = setup
    snap = environment.snapshot
    stale_sources = {p: s.model_copy(update={"source": "stale", "fetched_at": s.fetched_at - timedelta(hours=2)})
                     for p, s in snap.sources.items()}
    environment.snapshot = snap.model_copy(update={"sources": stale_sources})
    a = client.get(f"/members/{mid}/risk", headers=h).json()["assessment"]
    assert "open-meteo-air-quality" in a["stale_providers"]
    assert any("stale data" in w for w in a["warnings"])
