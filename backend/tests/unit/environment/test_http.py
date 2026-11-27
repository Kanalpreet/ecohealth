"""Shared HTTP layer: retries, backoff, errors, rate limiting."""

import httpx
import pytest

from app.services.environment.errors import ProviderResponseError, ProviderUnavailableError
from app.services.environment.ratelimit import SlidingWindowRateLimiter
from tests.unit.environment.conftest import Recorder, run, sequence

pytestmark = pytest.mark.unit

URL = "https://api.example.com/v1/data"
PARAMS = {"latitude": 28.61, "longitude": 77.21}
OK = httpx.Response(200, json={"ok": True})


def get(http):
    return run(http.get_json(URL, params=PARAMS))


def test_success_returns_json(make_http, fake_sleep):
    rec = Recorder({"/v1/data": {"ok": True}})
    assert get(make_http("p", rec)) == {"ok": True}
    assert len(rec.requests) == 1 and fake_sleep.delays == []


def test_timeout_is_retried_then_succeeds(make_http, fake_sleep):
    rec = Recorder({"/v1/data": sequence(httpx.ReadTimeout("slow"), OK)})
    assert get(make_http("p", rec)) == {"ok": True}
    assert len(rec.requests) == 2
    assert fake_sleep.delays == [0.5]


def test_timeouts_exhaust_retries_with_exponential_backoff(make_http, fake_sleep):
    rec = Recorder({"/v1/data": sequence(httpx.ConnectTimeout("slow"))})
    with pytest.raises(ProviderUnavailableError) as exc_info:
        get(make_http("p", rec))
    assert exc_info.value.reason == "timeout after 3 attempts"
    assert len(rec.requests) == 3
    assert fake_sleep.delays == [0.5, 1.0]


def test_5xx_is_retried(make_http, fake_sleep):
    rec = Recorder({"/v1/data": sequence(httpx.Response(503), httpx.Response(502), OK)})
    assert get(make_http("p", rec)) == {"ok": True}
    assert len(rec.requests) == 3


def test_persistent_5xx_raises_unavailable(make_http):
    rec = Recorder({"/v1/data": sequence(httpx.Response(500))})
    with pytest.raises(ProviderUnavailableError, match="HTTP 500 after 3 attempts"):
        get(make_http("p", rec))


@pytest.mark.parametrize(("retry_after", "expected_delay"), [("2", 2.0), ("120", 4.0), ("soon", 0.5)])
def test_429_is_retried_honouring_retry_after_with_cap(make_http, fake_sleep, retry_after, expected_delay):
    rec = Recorder({"/v1/data": sequence(httpx.Response(429, headers={"Retry-After": retry_after}), OK)})
    assert get(make_http("p", rec)) == {"ok": True}
    assert fake_sleep.delays == [expected_delay]


@pytest.mark.parametrize(("status", "reason"), [(404, "HTTP 404"), (401, "HTTP 401 (check API key)")])
def test_other_4xx_are_not_retried(make_http, fake_sleep, status, reason):
    rec = Recorder({"/v1/data": sequence(httpx.Response(status))})
    with pytest.raises(ProviderUnavailableError) as exc_info:
        get(make_http("p", rec))
    assert exc_info.value.reason == reason
    assert len(rec.requests) == 1 and fake_sleep.delays == []


def test_connection_error_is_not_retried(make_http):
    rec = Recorder({"/v1/data": sequence(httpx.ConnectError("refused"))})
    with pytest.raises(ProviderUnavailableError, match="connection failed"):
        get(make_http("p", rec))
    assert len(rec.requests) == 1


def test_invalid_json_is_a_response_error(make_http):
    rec = Recorder({"/v1/data": lambda r: httpx.Response(200, text="<html>oops</html>")})
    with pytest.raises(ProviderResponseError, match="not valid JSON"):
        get(make_http("p", rec))


def test_error_messages_never_contain_coordinates_or_url(make_http):
    rec = Recorder({"/v1/data": sequence(httpx.Response(503))})
    with pytest.raises(ProviderUnavailableError) as exc_info:
        get(make_http("p", rec))
    assert "28.61" not in str(exc_info.value) and "example.com" not in str(exc_info.value)


def test_retry_logs_do_not_contain_query_string(make_http, caplog):
    rec = Recorder({"/v1/data": sequence(httpx.Response(503), OK)})
    with caplog.at_level("INFO", logger="app.services.environment.http"):
        get(make_http("p", rec))
    assert "/v1/data" in caplog.text
    assert "28.61" not in caplog.text and "latitude" not in caplog.text


# ---- Rate limiter ----


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_rate_limiter_refuses_calls_beyond_each_window():
    clock = FakeClock()
    limiter = SlidingWindowRateLimiter("openaq", [(2, 60), (3, 3600)], clock=clock)
    limiter.acquire()
    limiter.acquire()
    with pytest.raises(ProviderUnavailableError, match=r"2 per 60 s"):
        limiter.acquire()
    clock.now = 61  # minute window passed
    limiter.acquire()
    clock.now = 62
    with pytest.raises(ProviderUnavailableError, match=r"3 per 3600 s"):
        limiter.acquire()
    clock.now = 3700  # hour window passed
    limiter.acquire()


def test_rate_limiter_is_applied_before_each_request(make_http):
    limiter = SlidingWindowRateLimiter("p", [(1, 60)], clock=FakeClock())
    rec = Recorder({"/v1/data": {"ok": True}})
    http = make_http("p", rec, rate_limiter=limiter)
    get(http)
    with pytest.raises(ProviderUnavailableError, match="local rate limit"):
        get(http)
    assert len(rec.requests) == 1  # refused call never reached the network
