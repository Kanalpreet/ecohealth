"""Refresh rotation decisions, rate limiting, auth settings, 422 handler, CORS (no database)."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, SecretStr, ValidationError

from app.core.config import Settings
from app.core.errors import install_error_handling
from app.core.ratelimit import AttemptLimiter, LoginRateLimiter
from app.models import RefreshToken
from app.services.auth import RefreshStatus, classify_refresh_token

pytestmark = pytest.mark.unit

NOW = datetime(2026, 6, 1, 12, 0, tzinfo=UTC)
DB = "postgresql+psycopg://u:p@localhost:5432/db"


# ---- refresh rotation decision ----


def token(**kwargs) -> RefreshToken:
    return RefreshToken(expires_at=kwargs.get("expires_at", NOW + timedelta(days=1)), revoked_at=kwargs.get("revoked_at"))


def test_classify_refresh_token():
    assert classify_refresh_token(None, NOW) is RefreshStatus.UNKNOWN
    assert classify_refresh_token(token(), NOW) is RefreshStatus.VALID
    assert classify_refresh_token(token(expires_at=NOW), NOW) is RefreshStatus.EXPIRED
    assert classify_refresh_token(token(expires_at=NOW - timedelta(seconds=1)), NOW) is RefreshStatus.EXPIRED


def test_revoked_token_is_reuse_even_if_not_expired():
    # A rotated (revoked) token presented again means it was copied: treat as theft.
    assert classify_refresh_token(token(revoked_at=NOW - timedelta(minutes=1)), NOW) is RefreshStatus.REUSED
    assert classify_refresh_token(token(revoked_at=NOW, expires_at=NOW - timedelta(days=1)), NOW) is RefreshStatus.REUSED


# ---- rate limiting ----


class Clock:
    def __init__(self) -> None:
        self.t = 0.0

    def __call__(self) -> float:
        return self.t


def test_attempt_limiter_window():
    clock = Clock()
    limiter = AttemptLimiter(max_attempts=3, window_seconds=60, clock=clock)
    for _ in range(3):
        assert limiter.retry_after("k") is None
        limiter.record("k")
    assert limiter.retry_after("k") == 61
    clock.t = 30
    assert limiter.retry_after("k") == 31
    clock.t = 60
    assert limiter.retry_after("k") is None  # oldest attempt left the window
    limiter.record("k")
    limiter.reset("k")
    assert limiter.retry_after("k") is None


def test_login_limiter_combines_email_and_ip():
    limiter = LoginRateLimiter(max_failures_per_email=2, max_attempts_per_ip=3, window_seconds=60, clock=Clock())
    limiter.by_email.record("a@example.com")
    limiter.by_email.record("a@example.com")
    assert limiter.retry_after("a@example.com", "1.1.1.1") is not None
    assert limiter.retry_after("b@example.com", "1.1.1.1") is None  # other email unaffected
    for _ in range(3):
        limiter.by_ip.record("2.2.2.2")
    assert limiter.retry_after("b@example.com", "2.2.2.2") is not None  # IP limit applies to any email


# ---- settings ----


def test_jwt_secret_must_be_long_and_blank_means_unset():
    assert Settings(_env_file=None, database_url=DB, jwt_secret_key=" ").jwt_secret_key is None
    with pytest.raises(ValidationError):
        Settings(_env_file=None, database_url=DB, jwt_secret_key="too-short")
    s = Settings(_env_file=None, database_url=DB, jwt_secret_key="s" * 32)
    assert "s" * 32 not in repr(s)


def test_cors_origins_are_parsed_from_a_comma_separated_string():
    s = Settings(_env_file=None, database_url=DB, cors_origins=" http://localhost:3000 , https://eco.example.com,")
    assert s.cors_origin_list == ["http://localhost:3000", "https://eco.example.com"]
    assert Settings(_env_file=None, database_url=DB).cors_origin_list == ["http://localhost:3000"]


def test_auth_defaults():
    s = Settings(_env_file=None, database_url=DB, jwt_secret_key=SecretStr("k" * 40))
    assert (s.access_token_expire_minutes, s.refresh_token_expire_days) == (30, 7)
    assert (s.refresh_cookie_secure, s.refresh_cookie_samesite) == (False, "lax")


# ---- 422 handler never echoes input ----


class Body(BaseModel):
    email: str
    password: str
    age: int


def test_validation_errors_do_not_echo_submitted_values():
    app = FastAPI()
    install_error_handling(app)

    @app.post("/echo")
    def echo(body: Body):
        return {"ok": True}

    client = TestClient(app)
    secret = "My-Secret-Password-123"
    response = client.post("/echo", json={"email": "x@example.com", "password": secret, "age": "not-a-number"})
    assert response.status_code == 422
    body = response.json()
    assert body["error"] == "validation_error" and body["request_id"]
    assert body["details"][0]["loc"] == ["body", "age"]
    assert set(body["details"][0]) == {"loc", "msg", "type"}
    assert secret not in response.text and "not-a-number" not in response.text and "input" not in response.text

    bad_json = client.post("/echo", content=b'{"password": "' + secret.encode() + b'", broken', headers={"Content-Type": "application/json"})
    assert bad_json.status_code == 422 and secret not in bad_json.text


# ---- CORS ----


def test_cors_allows_the_configured_frontend_only():
    from main import app

    client = TestClient(app)
    allowed = client.options("/auth/login", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"})
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert allowed.headers.get("access-control-allow-credentials") == "true"
    denied = client.options("/auth/login", headers={"Origin": "https://evil.example.com", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in denied.headers
