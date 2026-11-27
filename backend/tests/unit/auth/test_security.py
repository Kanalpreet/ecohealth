"""Password policy, Argon2 hashing, JWT access tokens, refresh token material."""

import base64
import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from pydantic import SecretStr

from app.core.config import ConfigurationError, Settings
from app.core.security import (
    InvalidTokenError,
    PasswordPolicyError,
    check_password_policy,
    create_access_token,
    decode_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)

pytestmark = pytest.mark.unit

SECRET = "unit-test-secret-" + "x" * 32
DB = "postgresql+psycopg://u:p@localhost:5432/db"


def settings(**kwargs) -> Settings:
    return Settings(_env_file=None, database_url=DB, jwt_secret_key=SecretStr(SECRET), **kwargs)


# ---- password policy ----


@pytest.mark.parametrize(
    "password",
    ["a" * 9, "x" * 129, "password123", "PASSWORD123", "1234567890", "qwertyuiop", "  password123  "],
)
def test_policy_rejects_short_long_and_common_passwords(password):
    with pytest.raises(PasswordPolicyError):
        check_password_policy(password)


@pytest.mark.parametrize("password", ["a" * 10, "correct horse battery", "x" * 128, "allowercaseonly", "1029384756x"])
def test_policy_has_no_composition_rules(password):
    check_password_policy(password)  # no "must contain a digit/symbol" rules


def test_policy_rejects_email_as_password():
    with pytest.raises(PasswordPolicyError, match="email"):
        check_password_policy("Person.One@Example.com", "person.one@example.com")


def test_policy_messages_never_contain_the_password():
    for bad in ("short1", "password123"):
        with pytest.raises(PasswordPolicyError) as exc:
            check_password_policy(bad)
        assert bad not in str(exc.value)


# ---- hashing ----


def test_argon2id_hash_and_verify():
    h = hash_password("correct horse battery")
    assert h.startswith("$argon2id$") and "correct horse battery" not in h
    assert verify_password("correct horse battery", h)
    assert not verify_password("wrong horse battery", h)
    assert hash_password("correct horse battery") != h  # random salt


def test_verify_with_unknown_user_or_malformed_hash_is_false():
    assert verify_password("anything", None) is False
    assert verify_password("anything", "not-a-real-hash") is False


# ---- access tokens ----


def test_access_token_round_trip_and_claims():
    user_id = uuid.uuid4()
    token, lifetime = create_access_token(user_id, settings())
    assert lifetime == 30 * 60
    assert decode_access_token(token, settings()) == user_id
    claims = jwt.decode(token, SECRET, algorithms=["HS256"], issuer="ecohealth-api")
    assert claims["type"] == "access" and claims["exp"] - claims["iat"] == 1800 and claims["jti"]


def test_expired_token_is_rejected():
    token, _ = create_access_token(uuid.uuid4(), settings(), now=datetime.now(UTC) - timedelta(minutes=31))
    with pytest.raises(InvalidTokenError):
        decode_access_token(token, settings())


def test_tampered_token_is_rejected():
    token, _ = create_access_token(uuid.uuid4(), settings())
    header, payload, signature = token.split(".")
    claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    claims["sub"] = str(uuid.uuid4())  # try to become someone else
    forged = base64.urlsafe_b64encode(json.dumps(claims).encode()).rstrip(b"=").decode()
    with pytest.raises(InvalidTokenError):
        decode_access_token(f"{header}.{forged}.{signature}", settings())


def test_token_signed_with_another_secret_is_rejected():
    token = jwt.encode({"sub": str(uuid.uuid4()), "type": "access", "iss": "ecohealth-api",
                        "iat": int(datetime.now(UTC).timestamp()), "exp": int(datetime.now(UTC).timestamp()) + 60},
                       "another-secret-" + "y" * 32, algorithm="HS256")
    with pytest.raises(InvalidTokenError):
        decode_access_token(token, settings())


def test_unsigned_alg_none_token_is_rejected():
    now = int(datetime.now(UTC).timestamp())
    token = jwt.encode({"sub": str(uuid.uuid4()), "type": "access", "iss": "ecohealth-api", "iat": now, "exp": now + 60},
                       key=None, algorithm="none")
    with pytest.raises(InvalidTokenError):
        decode_access_token(token, settings())


@pytest.mark.parametrize("overrides", [{"type": "refresh"}, {"iss": "someone-else"}, {"sub": "not-a-uuid"}])
def test_wrong_type_issuer_or_subject_is_rejected(overrides):
    now = int(datetime.now(UTC).timestamp())
    claims = {"sub": str(uuid.uuid4()), "type": "access", "iss": "ecohealth-api", "iat": now, "exp": now + 60, **overrides}
    with pytest.raises(InvalidTokenError):
        decode_access_token(jwt.encode(claims, SECRET, algorithm="HS256"), settings())


def test_missing_secret_is_a_configuration_error():
    no_secret = Settings(_env_file=None, database_url=DB)
    with pytest.raises(ConfigurationError):
        create_access_token(uuid.uuid4(), no_secret)


def test_access_token_lifetime_is_configurable():
    _, lifetime = create_access_token(uuid.uuid4(), settings(access_token_expire_minutes=5))
    assert lifetime == 300


# ---- refresh token material ----


def test_refresh_tokens_are_random_and_stored_as_sha256():
    a, b = new_refresh_token(settings()), new_refresh_token(settings())
    assert a.token != b.token and len(a.token) >= 60
    assert a.token_hash == hashlib.sha256(a.token.encode()).hexdigest() == hash_refresh_token(a.token)
    assert a.token not in a.token_hash


def test_refresh_token_expiry_follows_settings():
    now = datetime(2026, 1, 1, tzinfo=UTC)
    assert new_refresh_token(settings(), now).expires_at == now + timedelta(days=7)
    assert new_refresh_token(settings(refresh_token_expire_days=1), now).expires_at == now + timedelta(days=1)
