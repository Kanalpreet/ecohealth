"""OpenAQ v3 client: key handling, filtering, staleness, failures (saved fixtures)."""

from datetime import UTC, datetime

import httpx
import pytest
from pydantic import SecretStr

from app.services.environment.errors import ProviderNotConfiguredError
from app.services.environment.openaq import OpenAQClient
from tests.unit.environment.conftest import FAKE_KEY, NOW, Recorder, load, run, sequence

pytestmark = pytest.mark.unit

LOCATIONS = "/v3/locations"


def routes(**overrides):
    base = {
        LOCATIONS: load("openaq_locations"),
        "/v3/locations/17/latest": load("openaq_latest_17"),
        "/v3/locations/50/latest": load("openaq_latest_50"),
    }
    base.update(overrides)
    return base


def client(make_http, rec, key=FAKE_KEY, **kwargs):
    api_key = SecretStr(key) if key is not None else None
    return OpenAQClient(make_http("openaq", rec), api_key=api_key, clock=lambda: NOW, **kwargs)


def stations(make_http, rec, **kwargs):
    return run(client(make_http, rec, **kwargs).get_nearby_stations(28.61, 77.21))


def test_missing_key_raises_not_configured_without_any_request(make_http):
    rec = Recorder(routes())
    with pytest.raises(ProviderNotConfiguredError, match="OPENAQ_API_KEY"):
        stations(make_http, rec, key=None)
    with pytest.raises(ProviderNotConfiguredError):
        stations(make_http, rec, key="")
    assert rec.requests == []


def test_key_is_sent_only_in_the_x_api_key_header(make_http):
    rec = Recorder(routes())
    stations(make_http, rec)
    assert rec.requests
    for request in rec.requests:
        assert request.headers["X-API-Key"] == FAKE_KEY
        assert FAKE_KEY not in str(request.url)


def test_locations_query_uses_lat_lon_and_max_radius(make_http):
    rec = Recorder(routes())
    stations(make_http, rec)
    params = rec.calls(LOCATIONS)[0].url.params
    assert params["coordinates"] == "28.61,77.21"
    assert params["radius"] == "25000"


def test_fresh_pm_stations_sorted_by_distance_and_stale_ones_ignored(make_http):
    rec = Recorder(routes())
    report = stations(make_http, rec)

    assert [s.station_id for s in report.stations] == [17, 50]  # 5.65 km before 10.49 km
    assert [s.distance_km for s in report.stations] == [5.65, 10.49]
    # Ignored: id 13 (last reading 2018) and id 15 (never reported). Not counted:
    # id 99 (no PM sensor at all).
    assert report.ignored_stale_stations == 2
    assert (report.radius_km, report.max_age_hours) == (25.0, 3.0)
    # Only the two fresh stations were queried for latest readings.
    assert {r.url.path for r in rec.requests} == {LOCATIONS, "/v3/locations/17/latest", "/v3/locations/50/latest"}


def test_measurements_have_values_times_ages_and_stale_flags(make_http):
    report = stations(make_http, Recorder(routes()))
    rk_puram = report.stations[0]
    assert rk_puram.name == "R K Puram, Delhi - DPCC"
    assert rk_puram.data_owner == "CPCB"
    assert rk_puram.pm2_5.value == 70.0
    assert rk_puram.pm2_5.measured_at == datetime(2026, 11, 27, 7, 50, tzinfo=UTC)
    assert rk_puram.pm2_5.age_minutes == 30 and rk_puram.pm2_5.is_stale is False
    assert rk_puram.has_fresh_data is True


def test_old_sensor_readings_are_dropped_even_if_station_is_fresh(make_http):
    report = stations(make_http, Recorder(routes()))
    rk_puram = report.stations[0]
    # PM10 last measured at 04:00 (4 h 20 min before NOW, max age 3 h): dropped,
    # while the station's fresh PM2.5 reading is kept.
    assert rk_puram.pm10 is None
    assert rk_puram.pm2_5 is not None
    assert "openaq: 1 sensor reading(s) older than 3 h dropped" in report.warnings
    assert all(not m.is_stale for s in report.stations for m in (s.pm2_5, s.pm10) if m is not None)


def test_max_age_is_configurable(make_http):
    report = stations(make_http, Recorder(routes()), max_age_hours=0.5)
    # Punjabi Bagh (last 07:30, 50 min old) is now too old; R K Puram (30 min) still fresh.
    assert [s.station_id for s in report.stations] == [17]
    assert report.ignored_stale_stations == 3


def test_max_stations_limits_latest_calls(make_http):
    rec = Recorder(routes())
    report = stations(make_http, rec, max_stations=1)
    assert [s.station_id for s in report.stations] == [17]
    assert len(rec.calls("/v3/locations/50/latest")) == 0


def test_one_station_failing_keeps_the_others(make_http):
    rec = Recorder(routes(**{"/v3/locations/50/latest": sequence(httpx.Response(500))}))
    report = stations(make_http, rec)
    assert [s.station_id for s in report.stations] == [17]
    assert "openaq: latest readings unavailable for station 50 (HTTP 500 after 3 attempts)" in report.warnings


def test_implausible_readings_are_removed_and_flagged(make_http):
    latest = load("openaq_latest_50")
    latest["results"][0]["value"] = -999.0  # common "no data" sentinel
    report = stations(make_http, Recorder(routes(**{"/v3/locations/50/latest": latest})))
    punjabi_bagh = report.stations[1]
    assert punjabi_bagh.pm2_5 is None and punjabi_bagh.pm10.value == 143.0
    assert "openaq: 1 implausible pm2_5 value(s) removed" in report.warnings


def test_unknown_data_owner_becomes_none(make_http):
    locations = load("openaq_locations")
    locations["results"][2]["provider"]["name"] = "N/A"
    report = stations(make_http, Recorder(routes(**{LOCATIONS: locations})))
    assert report.stations[0].data_owner is None


def test_no_stations_in_range_returns_empty_report(make_http):
    report = stations(make_http, Recorder(routes(**{LOCATIONS: {"meta": {}, "results": []}})))
    assert report.stations == [] and report.ignored_stale_stations == 0


def test_bad_key_is_reported_without_retry(make_http):
    rec = Recorder(routes(**{LOCATIONS: sequence(httpx.Response(401))}))
    with pytest.raises(Exception, match=r"HTTP 401 \(check API key\)"):
        stations(make_http, rec)
    assert len(rec.requests) == 1


def test_radius_above_api_maximum_is_rejected(make_http):
    with pytest.raises(ValueError, match="25000"):
        run(client(make_http, Recorder(routes())).get_nearby_stations(28.61, 77.21, radius_m=30_000))
