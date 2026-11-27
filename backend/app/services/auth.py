"""Account and token logic. Functions never commit: the API layer owns the transaction.

See docs/auth.md.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import (
    check_password_policy,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)
from app.models import RefreshToken, User
from app.schemas.auth import RegisterRequest


class EmailTakenError(Exception):
    pass


def register_user(db: Session, data: RegisterRequest, now: datetime | None = None) -> User:
    """Create a user (password policy enforced; consent recorded). Raises PasswordPolicyError / EmailTakenError."""
    password = data.password.get_secret_value()
    check_password_policy(password, data.email)
    if db.execute(select(User.id).where(User.email == data.email)).first() is not None:
        raise EmailTakenError
    user = User(
        name=data.name,
        email=data.email,
        password_hash=hash_password(password),
        home_lat=data.home_lat,
        home_lon=data.home_lon,
        timezone=data.timezone,
        consent_at=now or datetime.now(UTC),
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:  # concurrent registration with the same email
        raise EmailTakenError from None
    return user


def authenticate(db: Session, email: str, password: str) -> User | None:
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    # Unknown email: still verify a dummy hash so timing does not reveal account existence.
    if not verify_password(password, user.password_hash if user else None):
        return None
    return user


# ---- Refresh tokens ----


def issue_refresh_token(
    db: Session, user_id: uuid.UUID, settings: Settings, family_id: uuid.UUID | None = None,
    now: datetime | None = None,
) -> str:
    """Store a new hashed refresh token; return the raw token (for the cookie only)."""
    material = new_refresh_token(settings, now)
    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=material.token_hash,
            family_id=family_id or uuid.uuid4(),
            expires_at=material.expires_at,
        )
    )
    db.flush()
    return material.token


class RefreshStatus(Enum):
    VALID = "valid"
    UNKNOWN = "unknown"
    EXPIRED = "expired"
    REUSED = "reused"  # already rotated or revoked: probable theft


def classify_refresh_token(token: RefreshToken | None, now: datetime) -> RefreshStatus:
    """Pure decision used by rotation (unit-testable without a database)."""
    if token is None:
        return RefreshStatus.UNKNOWN
    if token.revoked_at is not None:
        return RefreshStatus.REUSED
    if token.expires_at <= now:
        return RefreshStatus.EXPIRED
    return RefreshStatus.VALID


@dataclass(frozen=True)
class RotationResult:
    status: RefreshStatus
    user_id: uuid.UUID | None = None
    new_token: str | None = None


def revoke_family(db: Session, family_id: uuid.UUID, now: datetime) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )


def rotate_refresh_token(db: Session, raw_token: str, settings: Settings, now: datetime | None = None) -> RotationResult:
    """Revoke the presented token and issue its successor in the same family.

    Reuse of an already-revoked token revokes the whole family. The row is locked
    (SELECT ... FOR UPDATE) so two concurrent refreshes cannot both succeed.
    The CALLER must commit, also on REUSED (so the family revocation persists).
    """
    now = now or datetime.now(UTC)
    stmt = select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_token)).with_for_update()
    token = db.execute(stmt).scalar_one_or_none()
    status = classify_refresh_token(token, now)
    if status is RefreshStatus.REUSED:
        revoke_family(db, token.family_id, now)
        return RotationResult(status)
    if status is not RefreshStatus.VALID:
        return RotationResult(status)
    token.revoked_at = now
    new_token = issue_refresh_token(db, token.user_id, settings, family_id=token.family_id, now=now)
    return RotationResult(status, user_id=token.user_id, new_token=new_token)


def logout(db: Session, raw_token: str | None, now: datetime | None = None) -> None:
    """Revoke the family of the presented refresh token (if any)."""
    if not raw_token:
        return
    token = db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_token))
    ).scalar_one_or_none()
    if token is not None:
        revoke_family(db, token.family_id, now or datetime.now(UTC))
