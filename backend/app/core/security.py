"""Passwords (Argon2id), password policy, JWT access tokens, refresh token material.

Nothing here logs or returns a password, hash or token in an error message.
See docs/auth.md.
"""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from app.core.config import ConfigurationError, Settings
from app.core.constants import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

_password_hash = PasswordHash((Argon2Hasher(),))
# Verified for unknown emails so login timing does not reveal which emails exist.
_DUMMY_HASH = _password_hash.hash(secrets.token_urlsafe(32))


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    """Constant-ish time check; with password_hash=None a dummy hash is verified (returns False)."""
    if password_hash is None:
        _password_hash.verify(password, _DUMMY_HASH)
        return False
    try:
        return _password_hash.verify(password, password_hash)
    except Exception:  # noqa: BLE001 - a malformed stored hash must not crash login
        return False


# ---------------------------------------------------------------------------
# Password policy (open item M4): 10-128 characters, no composition rules,
# reject very common passwords and the user's own email.
# ---------------------------------------------------------------------------

COMMON_PASSWORDS = frozenset({
    "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd",
    "1234567890", "12345678910", "123456789", "0123456789", "0987654321", "1111111111", "0000000000",
    "1234512345", "1122334455", "qwertyuiop", "qwerty1234", "qwerty12345", "qwerty123456", "asdfghjkl",
    "asdfghjkl1", "zxcvbnm123", "1q2w3e4r5t", "1qaz2wsx3edc", "qazwsxedc", "iloveyou12", "iloveyou123",
    "letmein123", "welcome123", "welcome1234", "admin12345", "administrator", "abcdefghij", "abc1234567",
    "abcd123456", "football123", "baseball123", "sunshine123", "princess123", "dragon1234", "monkey1234",
    "superman123", "trustno1234", "india12345", "india@1234", "bharat1234", "cricket123", "changeme123",
    "secret1234", "mypassword", "ecohealth", "ecohealth1", "ecohealth123",
})


class PasswordPolicyError(ValueError):
    """Raised with a user-facing reason; never contains the password."""


def check_password_policy(password: str, email: str | None = None) -> None:
    if len(password) < PASSWORD_MIN_LENGTH:
        raise PasswordPolicyError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters")
    if len(password) > PASSWORD_MAX_LENGTH:
        raise PasswordPolicyError(f"Password must be at most {PASSWORD_MAX_LENGTH} characters")
    if password.strip().lower() in COMMON_PASSWORDS:
        raise PasswordPolicyError("This password is too common; please choose another")
    if email and password.strip().lower() == email.strip().lower():
        raise PasswordPolicyError("Password must not be your email address")


# ---------------------------------------------------------------------------
# Access tokens (JWT, HS256)
# ---------------------------------------------------------------------------

JWT_ALGORITHM = "HS256"  # fixed in code: no algorithm negotiation
JWT_ISSUER = "ecohealth-api"
ACCESS_TOKEN_TYPE = "access"


class InvalidTokenError(Exception):
    """Token missing, malformed, tampered, expired or of the wrong type (message is generic)."""


def _secret(settings: Settings) -> str:
    if settings.jwt_secret_key is None:
        raise ConfigurationError("JWT_SECRET_KEY is not configured")
    return settings.jwt_secret_key.get_secret_value()


def create_access_token(user_id: uuid.UUID, settings: Settings, now: datetime | None = None) -> tuple[str, int]:
    """Returns (token, lifetime in seconds)."""
    issued = now or datetime.now(UTC)
    lifetime = timedelta(minutes=settings.access_token_expire_minutes)
    claims = {
        "sub": str(user_id),
        "type": ACCESS_TOKEN_TYPE,
        "iss": JWT_ISSUER,
        "iat": int(issued.timestamp()),
        "exp": int((issued + lifetime).timestamp()),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(claims, _secret(settings), algorithm=JWT_ALGORITHM), int(lifetime.total_seconds())


def decode_access_token(token: str, settings: Settings) -> uuid.UUID:
    """Validate signature, expiry, issuer and type; return the user id."""
    try:
        claims = jwt.decode(
            token,
            _secret(settings),
            algorithms=[JWT_ALGORITHM],
            issuer=JWT_ISSUER,
            options={"require": ["sub", "exp", "iat", "type", "iss"]},
        )
        if claims.get("type") != ACCESS_TOKEN_TYPE:
            raise InvalidTokenError("wrong token type")
        return uuid.UUID(claims["sub"])
    except (jwt.PyJWTError, ValueError, KeyError) as exc:
        raise InvalidTokenError("invalid token") from exc


# ---------------------------------------------------------------------------
# Refresh tokens (opaque random strings; only their SHA-256 is stored)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class NewRefreshToken:
    token: str  # goes to the client cookie ONLY
    token_hash: str  # goes to the database ONLY
    expires_at: datetime


def hash_refresh_token(token: str) -> str:
    # A fast hash is fine: the token is 48 random bytes, not a guessable password.
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_refresh_token(settings: Settings, now: datetime | None = None) -> NewRefreshToken:
    token = secrets.token_urlsafe(48)
    expires = (now or datetime.now(UTC)) + timedelta(days=settings.refresh_token_expire_days)
    return NewRefreshToken(token=token, token_hash=hash_refresh_token(token), expires_at=expires)
