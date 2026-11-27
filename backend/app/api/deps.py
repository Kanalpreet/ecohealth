"""Shared FastAPI dependencies: settings, DB session, current user, rate limiter."""

from functools import lru_cache
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.client_ip import resolve_client_ip
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.ratelimit import LoginRateLimiter
from app.core.security import InvalidTokenError, decode_access_token
from app.models import User

_bearer = HTTPBearer(auto_error=False)
_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def settings_dep() -> Settings:
    return get_settings()


SettingsDep = Annotated[Settings, Depends(settings_dep)]
DbDep = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DbDep,
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    """Valid Bearer access token -> the user. Any problem -> generic 401."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _UNAUTHORIZED
    try:
        user_id = decode_access_token(credentials.credentials, settings)
    except InvalidTokenError:
        raise _UNAUTHORIZED from None
    user = db.get(User, user_id)
    if user is None:  # e.g. account deleted after the token was issued
        raise _UNAUTHORIZED
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


@lru_cache
def get_login_limiter() -> LoginRateLimiter:
    s = get_settings()
    return LoginRateLimiter(s.login_max_failures_per_email, s.login_max_attempts_per_ip, s.login_window_minutes * 60)


def client_ip(request: Request, settings: Settings) -> str:
    """Client address for rate limiting; X-Forwarded-For only from TRUSTED_PROXIES (app/core/client_ip.py)."""
    return resolve_client_ip(
        request.client.host if request.client else None,
        request.headers.getlist("x-forwarded-for"),
        settings.trusted_proxy_networks,
    )
