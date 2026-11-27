"""hourly_assessment, safe_windows and check_routines (time zones: Asia/Kolkata, Europe/London)."""

from datetime import UTC, datetime, time, timedelta

import pytest

from app.models import Routine
from app.services.risk import RoutineInput, check_routines, hourly_assessment, next_occurrence, safe_windows
from tests.unit.risk.helpers import HEALTHY, PRIYA, T0, make_snapshot

pytestmark = pytest.mark.unit

IST = "Asia/Kolkata"
EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def ist_hour(t: datetime) -> int:
    return (t + timedelta(hours=5, minutes=30)).hour


def polluted_except(start_ist: int, end_ist: int):
    """PM2.5 severe (300) except between start_ist and end_ist (IST hours, exclusive end), where it is clean."""
    return lambda t: 5.0 if start_ist <= ist_hour(t) < end_ist else 300.0


# ---- hourly assessment ----


def test_hourly_assessment_starts_at_next_full_hour_in_utc():
    hourly = hourly_assessment(HEALTHY, make_snapshot(), hours=48)
    assert len(hourly) == 48
    assert hourly[0].time == T0 + timedelta(hours=1)
    assert all(h.time.tzinfo is not None and h.time.utcoffset() == timedelta(0) for h in hourly)
    assert [h.time for h in hourly] == sorted(h.time for h in hourly)


def test_hourly_assessment_uses_hourly_concentrations():
    snap = make_snapshot(pm25=lambda t: 300.0 if t == T0 + timedelta(hours=3) else 10.0)
    hourly = {h.time: h for h in hourly_assessment(HEALTHY, snap, hours=6)}
    spike = hourly[T0 + timedelta(hours=3)]
    assert spike.level != "Low" and spike.top_factors == ["air_quality"]
    assert hourly[T0 + timedelta(hours=2)].level == "Low"


def test_hourly_assessment_stops_where_the_forecast_ends():
    hourly = hourly_assessment(HEALTHY, make_snapshot(future_hours=10), hours=48)
    assert len(hourly) == 10


# ---- safe windows ----


def test_safe_windows_are_contiguous_ranges_in_local_time():
    # Forecast hours are on the UTC grid, so in IST (+05:30) each hour starts at :30.
    # Clean air in the hours starting 14:30-17:30 IST and 22:30-23:30 IST; severe otherwise.
    snap = make_snapshot(pm25=lambda t: 5.0 if 14 <= ist_hour(t) < 18 or ist_hour(t) >= 22 else 300.0, pm10=None)
    windows = safe_windows(hourly_assessment(HEALTHY, snap), IST)
    local = [(w.start_local.strftime("%H:%M"), w.end_local.strftime("%H:%M"), w.hours) for w in windows]
    assert local == [("14:30", "18:30", 4), ("22:30", "00:30", 2)]
    w = windows[0]
    assert w.timezone == IST and w.start_local.utcoffset() == timedelta(hours=5, minutes=30)
    assert w.start == datetime(2026, 3, 1, 9, 0, tzinfo=UTC) and w.worst_level in ("Low", "Moderate")


def test_safe_window_threshold_is_configurable():
    snap = make_snapshot(pm25=polluted_except(14, 18), pm10=None)
    hourly = hourly_assessment(HEALTHY, snap)
    assert safe_windows(hourly, IST, below="High")  # clean afternoon is safe
    assert safe_windows(hourly, IST, below="Dangerous")[0].hours > safe_windows(hourly, IST, below="High")[0].hours


def test_no_safe_window_when_every_hour_is_unsafe():
    assert safe_windows(hourly_assessment(PRIYA, make_snapshot(pm25=400.0)), IST) == []


def test_safe_windows_only_look_at_the_first_24_hours():
    windows = safe_windows(hourly_assessment(HEALTHY, make_snapshot()), IST, hours=24)
    assert windows[0].hours == 24


# ---- routines ----


def walk(at: time = time(6, 30), days=EVERY_DAY) -> RoutineInput:
    return RoutineInput(activity="morning walk", start_time=at, days_of_week=days)


def test_next_occurrence_is_computed_in_the_users_time_zone():
    # T0 = Sunday 11:30 IST -> next 06:30 IST is Monday 06:30 IST = 01:00 UTC.
    nxt = next_occurrence(walk(), T0, IST)
    assert (nxt.strftime("%a %H:%M"), nxt.utcoffset()) == ("Mon 06:30", timedelta(hours=5, minutes=30))
    assert nxt.astimezone(UTC) == datetime(2026, 3, 2, 1, 0, tzinfo=UTC)


def test_next_occurrence_respects_days_of_week():
    nxt = next_occurrence(walk(days=["wed"]), T0, IST)
    assert nxt.strftime("%a %d") == "Wed 04"


def test_routine_in_unsafe_hour_is_flagged():
    snap = make_snapshot(pm25=polluted_except(14, 18), pm10=None)  # 06:30 IST is severe
    (check,) = check_routines(PRIYA, [walk()], snap, IST)
    assert check.status == "unsafe" and check.level in ("High", "Very High", "Dangerous")
    assert check.next_occurrence_utc == datetime(2026, 3, 2, 1, 0, tzinfo=UTC)
    assert check.top_factors[0] == "air_quality"


def test_routine_in_safe_hour_is_ok():
    snap = make_snapshot(pm25=polluted_except(6, 8), pm10=None)  # clean 06:00-08:00 IST
    (check,) = check_routines(PRIYA, [walk()], snap, IST)
    assert check.status == "ok" and check.level in ("Low", "Moderate")


def test_routine_beyond_the_forecast_reports_no_forecast():
    snap = make_snapshot(future_hours=6)
    (check,) = check_routines(HEALTHY, [walk()], snap, IST)
    assert check.status == "no_forecast" and check.score is None
    assert check.next_occurrence_local is not None


def test_routines_accept_orm_objects():
    routine = Routine(activity="temple visit", start_time=time(7, 0), days_of_week=["mon"])
    (check,) = check_routines(HEALTHY, [routine], make_snapshot(), IST)
    assert check.activity == "temple visit" and check.status == "ok"


def test_routine_across_a_daylight_saving_change():
    # UK clocks go forward on Sunday 29 March 2026 at 01:00 UTC.
    before = datetime(2026, 3, 28, 12, 0, tzinfo=UTC)
    nxt = next_occurrence(walk(at=time(7, 0), days=["mon"]), before, "Europe/London")
    assert nxt.astimezone(UTC) == datetime(2026, 3, 30, 6, 0, tzinfo=UTC)  # 07:00 BST = 06:00 UTC
    winter = next_occurrence(walk(at=time(7, 0), days=["mon"]), datetime(2026, 3, 20, tzinfo=UTC), "Europe/London")
    assert winter.astimezone(UTC) == datetime(2026, 3, 23, 7, 0, tzinfo=UTC)  # 07:00 GMT
