"""Auth and /me flows against Supabase (rolled back)."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.security import create_access_token, hash_refresh_token
from app.models import FamilyMember, RefreshToken, Routine, User
from tests.integration.conftest import STRONG_PASSWORD, login, new_user, register, unique_email

pytestmark = pytest.mark.integration

COOKIE = "ecohealth_refresh"


def refresh_cookie(response) -> str | None:
    return response.cookies.get(COOKIE)


def set_cookie_header(response) -> str:
    return next((v for k, v in response.headers.multi_items() if k.lower() == "set-cookie" and COOKIE in v), "")


def assert_no_secrets(response) -> None:
    text = response.text
    assert "argon2" not in text and "password_hash" not in text and STRONG_PASSWORD not in text


# ---- happy path ----


def test_register_login_refresh_logout_flow(client, db_session):
    email = unique_email()
    r = register(client, email, timezone="Asia/Kolkata", home_lat=28.61394, home_lon=77.20902)
    assert r.status_code == 201
    user = r.json()
    assert user["email"] == email and user["consent_at"] is not None
    assert (user["home_lat"], user["home_lon"]) == (28.61, 77.21)  # rounded to ~1 km
    assert_no_secrets(r)

    r = login(client, email)
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer" and body["expires_in"] == 1800
    cookie_header = set_cookie_header(r).lower()
    assert "httponly" in cookie_header and "path=/auth" in cookie_header and "samesite=lax" in cookie_header
    first_refresh = refresh_cookie(r)
    assert first_refresh and first_refresh not in r.text  # the refresh token is never in the JSON body
    assert_no_secrets(r)

    me = client.get("/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200 and me.json()["email"] == email
    assert_no_secrets(me)

    # Only the hash is stored.
    stored = db_session.execute(select(RefreshToken.token_hash)).scalars().all()
    assert hash_refresh_token(first_refresh) in stored and first_refresh not in stored

    r = client.post("/auth/refresh")
    assert r.status_code == 200 and r.json()["access_token"]
    second_refresh = refresh_cookie(r)
    assert second_refresh and second_refresh != first_refresh  # rotated

    r = client.post("/auth/logout")
    assert r.status_code == 204
    assert 'ecohealth_refresh=""' in set_cookie_header(r) or "max-age=0" in set_cookie_header(r).lower()

    client.cookies.set(COOKIE, second_refresh, path="/auth")
    assert client.post("/auth/refresh").status_code == 401  # family revoked by logout


def test_wrong_password_and_unknown_email_give_the_same_401(client):
    email = unique_email()
    register(client, email)
    wrong = login(client, email, "not-the-right-password")
    unknown = login(client, unique_email())
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": "Incorrect email or password"}


def test_login_email_is_case_insensitive(client):
    email = unique_email()
    register(client, email)
    assert login(client, email.upper()).status_code == 200


# ---- tokens ----


def test_missing_expired_and_tampered_access_tokens_are_rejected(client):
    email, headers = new_user(client)
    user_id = client.get("/me", headers=headers).json()["id"]

    missing = client.get("/me")
    assert missing.status_code == 401 and missing.headers["www-authenticate"] == "Bearer"

    expired, _ = create_access_token(uuid.UUID(user_id), get_settings(), now=datetime.now(UTC) - timedelta(hours=1))
    assert client.get("/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401

    token = headers["Authorization"].split()[1]
    tampered = token[:-4] + ("AAAA" if not token.endswith("AAAA") else "BBBB")
    assert client.get("/me", headers={"Authorization": f"Bearer {tampered}"}).status_code == 401
    assert client.get("/me", headers={"Authorization": "Basic abc"}).status_code == 401


def test_refresh_token_reuse_revokes_the_whole_family(client, db_session):
    email = unique_email()
    register(client, email)
    first = refresh_cookie(login(client, email))

    second = refresh_cookie(client.post("/auth/refresh"))  # first is now rotated (revoked)
    assert second and second != first

    client.cookies.set(COOKIE, first, path="/auth")  # an attacker replays the old token
    assert client.post("/auth/refresh").status_code == 401

    client.cookies.set(COOKIE, second, path="/auth")  # the legitimate newest token is dead too
    assert client.post("/auth/refresh").status_code == 401

    family = db_session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(second))
    ).scalar_one().family_id
    statuses = db_session.execute(select(RefreshToken.revoked_at).where(RefreshToken.family_id == family)).scalars().all()
    assert len(statuses) == 2 and all(s is not None for s in statuses)


def test_refresh_without_or_with_unknown_cookie_is_401(client):
    assert client.post("/auth/refresh").status_code == 401
    client.cookies.set(COOKIE, "not-a-real-token", path="/auth")
    assert client.post("/auth/refresh").status_code == 401


def test_expired_refresh_token_is_rejected(client, db_session):
    email = unique_email()
    register(client, email)
    raw = refresh_cookie(login(client, email))
    row = db_session.execute(select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw))).scalar_one()
    row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db_session.flush()
    assert client.post("/auth/refresh").status_code == 401


# ---- registration rules and error hygiene ----


@pytest.mark.parametrize("consent", [False, None])
def test_consent_is_required(client, consent):
    body = {"name": "Test", "email": unique_email(), "password": STRONG_PASSWORD}
    if consent is not None:
        body["consent"] = consent
    r = client.post("/auth/register", json=body)
    assert r.status_code == 422
    assert STRONG_PASSWORD not in r.text


@pytest.mark.parametrize("password", ["short-pw1", "password123", "1234567890"])
def test_password_policy_is_enforced(client, password):
    r = register(client, password=password)
    assert r.status_code == 422 and password not in r.text


def test_422_never_echoes_the_password(client):
    secret = "Unique-Secret-Value-987"
    r = client.post("/auth/register", json={"name": "T", "email": "not-an-email", "password": secret, "consent": True})
    assert r.status_code == 422
    assert secret not in r.text and "not-an-email" not in r.text
    r = client.post("/auth/login", json={"email": "bad", "password": secret})
    assert r.status_code == 422 and secret not in r.text


def test_duplicate_email_is_409(client):
    email = unique_email()
    assert register(client, email).status_code == 201
    assert register(client, email.upper()).status_code == 409


def test_register_rejects_internal_fields(client):
    r = register(client, password_hash="x", consent_at="2020-01-01T00:00:00Z")
    assert r.status_code == 422


# ---- /me ----


def test_patch_me_rounds_coordinates_and_validates_timezone(client):
    _, headers = new_user(client)
    r = client.patch("/me", headers=headers, json={"home_lat": 34.15678, "home_lon": 77.57123, "timezone": "Asia/Kolkata"})
    assert r.status_code == 200 and (r.json()["home_lat"], r.json()["home_lon"]) == (34.16, 77.57)
    assert client.patch("/me", headers=headers, json={"timezone": "Mars/Base"}).status_code == 422
    assert client.patch("/me", headers=headers, json={"home_lat": 10}).status_code == 422  # both or neither
    assert client.patch("/me", headers=headers, json={"email": "new@example.com"}).status_code == 422
    assert_no_secrets(r)


def test_export_contains_all_data_but_no_secrets(client):
    _, headers = new_user(client)
    member = client.post("/members", headers=headers, json={"name": "Priya", "age": 34, "conditions": ["asthma"]}).json()
    client.post(f"/members/{member['id']}/routines", headers=headers,
                json={"activity": "morning walk", "start_time": "06:30", "days_of_week": ["mon", "wed"]})
    r = client.get("/me/export", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["user"]["name"] == "Test User" and data["exported_at"]
    assert data["members"][0]["name"] == "Priya"
    assert data["members"][0]["routines"][0]["activity"] == "morning walk"
    assert_no_secrets(r)
    assert "token" not in r.text


def test_delete_me_cascades_everything(client, db_session):
    email, headers = new_user(client)
    member = client.post("/members", headers=headers, json={"name": "Aarav", "age": 6}).json()
    client.post(f"/members/{member['id']}/routines", headers=headers,
                json={"activity": "cycle to school", "start_time": "07:45", "days_of_week": ["mon"]})
    user_id = uuid.UUID(client.get("/me", headers=headers).json()["id"])

    assert client.delete("/me", headers=headers).status_code == 204

    db_session.expire_all()
    assert db_session.get(User, user_id) is None
    for model, column in ((FamilyMember, FamilyMember.user_id), (RefreshToken, RefreshToken.user_id)):
        assert db_session.execute(select(func.count()).select_from(model).where(column == user_id)).scalar_one() == 0
    assert db_session.execute(
        select(func.count()).select_from(Routine).where(Routine.member_id == uuid.UUID(member["id"]))
    ).scalar_one() == 0
    assert client.get("/me", headers=headers).status_code == 401  # token of a deleted user
    assert login(client, email).status_code == 401


# ---- rate limiting ----


def test_login_rate_limit_per_email(client, limiter):
    email = unique_email()
    register(client, email)
    for _ in range(5):
        assert login(client, email, "wrong-password-123").status_code == 401
    blocked = login(client, email)  # even the right password is blocked now
    assert blocked.status_code == 429 and int(blocked.headers["retry-after"]) > 0


def test_successful_login_resets_the_email_counter(client):
    email = unique_email()
    register(client, email)
    for _ in range(4):
        login(client, email, "wrong-password-123")
    assert login(client, email).status_code == 200
    for _ in range(4):
        assert login(client, email, "wrong-password-123").status_code == 401  # counter restarted


def test_login_rate_limit_per_ip(client, limiter):
    for _ in range(20):
        login(client, unique_email(), "whatever-password")
    assert login(client, unique_email()).status_code == 429


# ---- frontend /api proxy: cookie path and trusted X-Forwarded-For (docs/auth.md) ----


def test_refresh_cookie_uses_the_configured_path(client):
    from app.api.deps import settings_dep
    from main import app

    email = unique_email()
    register(client, email)
    proxied = get_settings().model_copy(update={"refresh_cookie_path": "/api/auth"})
    app.dependency_overrides[settings_dep] = lambda: proxied
    header = set_cookie_header(login(client, email)).lower()
    assert "path=/api/auth" in header and "httponly" in header


def _peer_client(host: str):
    from fastapi.testclient import TestClient

    from main import app

    return TestClient(app, client=(host, 50000))


def _attempt(test_client, forwarded_for: str | None):
    headers = {"X-Forwarded-For": forwarded_for} if forwarded_for else {}
    body = {"email": unique_email(), "password": "whatever-password"}
    return test_client.post("/auth/login", json=body, headers=headers).status_code


def test_ip_limit_uses_forwarded_for_from_a_trusted_proxy(client):
    from app.api.deps import get_login_limiter
    from app.core.ratelimit import LoginRateLimiter
    from main import app

    small = LoginRateLimiter(max_failures_per_email=5, max_attempts_per_ip=2, window_seconds=900)
    app.dependency_overrides[get_login_limiter] = lambda: small
    via_proxy = _peer_client("127.0.0.1")  # e.g. the Vite dev proxy (default TRUSTED_PROXIES=localhost)

    assert [_attempt(via_proxy, "203.0.113.5") for _ in range(2)] == [401, 401]
    assert _attempt(via_proxy, "203.0.113.5") == 429  # that client is limited...
    assert _attempt(via_proxy, "203.0.113.6") == 401  # ...another client behind the same proxy is not
    # A forged left-most entry does not help: the proxy appended the real address last.
    assert _attempt(via_proxy, "198.51.100.1, 203.0.113.5") == 429


def test_ip_limit_ignores_forwarded_for_from_an_untrusted_peer(client):
    from app.api.deps import get_login_limiter
    from app.core.ratelimit import LoginRateLimiter
    from main import app

    small = LoginRateLimiter(max_failures_per_email=5, max_attempts_per_ip=2, window_seconds=900)
    app.dependency_overrides[get_login_limiter] = lambda: small
    direct = _peer_client("198.51.100.7")  # not a trusted proxy

    assert [_attempt(direct, f"203.0.113.{n}") for n in (1, 2)] == [401, 401]
    assert _attempt(direct, "203.0.113.3") == 429  # spoofing X-Forwarded-For does not reset the limit
