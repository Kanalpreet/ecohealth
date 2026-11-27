"""Open-Meteo clients: parsing, units, missing/invalid values (saved fixtures)."""

from datetime import UTC, date, datetime

import pytest

from app.services.environment.errors import ProviderResponseError
from app.services.environment.open_meteo import (
    OpenMeteoAirQualityClient,
    OpenMeteoElevationClient,
    OpenMeteoWeatherClient,
)
from tests.unit.environment.conftest import Recorder, load, run

pytestmark = pytest.mark.unit

FORECAST = "/v1/forecast"
AIR = "/v1/air-quality"
ELEVATION = "/v1/elevation"


def weather(make_http, body):
    rec = Recorder({FORECAST: body})
    return rec, run(OpenMeteoWeatherClient(make_http("open-meteo-weather", rec)).get_forecast(28.61, 77.21))


def air(make_http, body):
    rec = Recorder({AIR: body})
    return rec, run(OpenMeteoAirQualityClient(make_http("open-meteo-air-quality", rec)).get_air_quality(28.61, 77.21))


# ---- Weather ----


def test_weather_parses_current_hourly_and_daily(make_http):
    _, forecast = weather(make_http, load("openmeteo_forecast"))
    c = forecast.current
    assert c.observed_at == datetime(2026, 11, 27, 8, 15, tzinfo=UTC)
    assert (c.temperature_c, c.apparent_temperature_c, c.relative_humidity_pct) == (23.5, 23.1, 41)
    assert (c.wind_speed_kmh, c.wind_direction_deg, c.uv_index, c.precipitation_mm) == (2.3, 23, 3.4, 0.0)
    assert len(forecast.hourly) == 6
    assert forecast.hourly[0].time == datetime(2026, 11, 27, 0, 0, tzinfo=UTC)
    assert all(p.time.tzinfo is UTC for p in forecast.hourly)
    assert forecast.daily[0].date == date(2026, 11, 27)
    assert (forecast.daily[0].min_c, forecast.daily[0].max_c) == (12.8, 23.6)
    assert forecast.warnings == []


def test_weather_request_asks_for_utc_metric_units_and_5_days(make_http):
    rec, _ = weather(make_http, load("openmeteo_forecast"))
    params = rec.requests[0].url.params
    assert params["timezone"] == "GMT"
    assert params["forecast_days"] == "5"
    assert (params["temperature_unit"], params["wind_speed_unit"], params["precipitation_unit"]) == ("celsius", "kmh", "mm")
    for variable in ("temperature_2m", "apparent_temperature", "relative_humidity_2m", "wind_speed_10m",
                     "wind_direction_10m", "uv_index", "precipitation"):
        assert variable in params["current"] and variable in params["hourly"]
    assert params["daily"] == "temperature_2m_max,temperature_2m_min"


def test_weather_rejects_unexpected_units(make_http):
    body = load("openmeteo_forecast")
    body["hourly_units"]["temperature_2m"] = "°F"
    with pytest.raises(ProviderResponseError, match=r"unexpected unit for hourly.temperature_2m"):
        weather(make_http, body)


def test_weather_rejects_non_utc_response(make_http):
    body = load("openmeteo_forecast")
    body["utc_offset_seconds"] = 19800
    with pytest.raises(ProviderResponseError, match="not in UTC"):
        weather(make_http, body)


def test_weather_rejects_missing_variable(make_http):
    body = load("openmeteo_forecast")
    del body["hourly"]["uv_index"]
    with pytest.raises(ProviderResponseError, match=r"hourly.uv_index"):
        weather(make_http, body)


def test_weather_rejects_arrays_of_different_length(make_http):
    body = load("openmeteo_forecast")
    body["hourly"]["temperature_2m"].pop()
    with pytest.raises(ProviderResponseError, match="different lengths"):
        weather(make_http, body)


def test_weather_flags_implausible_values_and_keeps_nulls(make_http):
    body = load("openmeteo_forecast")
    body["hourly"]["relative_humidity_2m"][1] = 150
    body["hourly"]["uv_index"][2] = -1
    body["hourly"]["temperature_2m"][3] = None
    _, forecast = weather(make_http, body)
    assert forecast.hourly[1].relative_humidity_pct is None
    assert forecast.hourly[2].uv_index is None
    assert forecast.hourly[3].temperature_c is None
    assert forecast.warnings == [
        "open-meteo-weather: 1 implausible relative_humidity_pct value(s) removed",
        "open-meteo-weather: 1 implausible uv_index value(s) removed",
    ]


def test_weather_rejects_unparseable_time(make_http):
    body = load("openmeteo_forecast")
    body["hourly"]["time"][0] = "yesterday"
    with pytest.raises(ProviderResponseError, match="unparseable time"):
        weather(make_http, body)


# ---- Air quality ----


def test_air_quality_parses_pollutants_in_micrograms(make_http):
    rec, aq = air(make_http, load("openmeteo_air_quality"))
    c = aq.current
    assert c.time == datetime(2026, 11, 27, 8, 0, tzinfo=UTC)
    assert (c.pm2_5, c.pm10, c.no2, c.o3, c.so2, c.co) == (72.6, 74.5, 20.5, 183.0, 55.8, 734.0)
    assert len(aq.hourly) == 6
    assert aq.hourly[0].time == datetime(2026, 11, 26, 0, 0, tzinfo=UTC)  # includes the past day
    params = rec.requests[0].url.params
    assert (params["past_days"], params["forecast_days"], params["timezone"]) == ("1", "5", "GMT")


def test_air_quality_null_forecast_tail_is_flagged(make_http):
    _, aq = air(make_http, load("openmeteo_air_quality"))
    assert aq.hourly[-1].pm2_5 is None
    assert "1 hourly point(s) without PM2.5" in aq.warnings[0]


@pytest.mark.parametrize("unit", ["μg/m³", "µg/m³"])  # Greek mu and micro sign
def test_air_quality_accepts_both_microgram_spellings(make_http, unit):
    body = load("openmeteo_air_quality")
    body["hourly_units"]["pm2_5"] = unit
    air(make_http, body)


def test_air_quality_rejects_other_units(make_http):
    body = load("openmeteo_air_quality")
    body["current_units"]["pm10"] = "ppm"
    with pytest.raises(ProviderResponseError, match=r"current.pm10"):
        air(make_http, body)


def test_air_quality_removes_negative_concentrations(make_http):
    body = load("openmeteo_air_quality")
    body["current"]["pm2_5"] = -999.0
    body["hourly"]["ozone"][0] = -5
    _, aq = air(make_http, body)
    assert aq.current.pm2_5 is None and aq.hourly[0].o3 is None
    assert "open-meteo-air-quality: 1 implausible o3 value(s) removed" in aq.warnings
    assert "open-meteo-air-quality: 1 implausible pm2_5 value(s) removed" in aq.warnings


def test_air_quality_missing_current_block_is_rejected(make_http):
    body = load("openmeteo_air_quality")
    del body["current"]
    with pytest.raises(ProviderResponseError, match="current"):
        air(make_http, body)


# ---- Elevation ----


def elevation(make_http, body):
    rec = Recorder({ELEVATION: body})
    return run(OpenMeteoElevationClient(make_http("open-meteo-elevation", rec)).get_elevation(28.61, 77.21))


def test_elevation_parses_metres(make_http):
    assert elevation(make_http, load("openmeteo_elevation")) == 217.0


@pytest.mark.parametrize("body", [{"elevation": []}, {"elevation": [None]}, {"elevation": [99999]}, {"height": 1}])
def test_elevation_rejects_missing_or_implausible(make_http, body):
    with pytest.raises(ProviderResponseError):
        elevation(make_http, body)
