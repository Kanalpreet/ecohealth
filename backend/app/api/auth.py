"""/auth: register, login, refresh, logout. See docs/auth.md."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status

from app.api.deps import DbDep, SettingsDep, client_ip, get_login_limiter
from app.core.ratelimit import LoginRateLimiter
from app.core.security import PasswordPolicyError, create_access_token
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.schemas.user import UserRead
from app.services import auth as auth_service
from app.services.auth import EmailTakenError, RefreshStatus

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "ecohealth_refresh"
REFRESH_COOKIE_PATH = "/auth"  # the cookie is only sent to /auth/* endpoints
_INVALID_LOGIN = "Incorrect email or password"
_INVALID_REFRESH = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")


def set_refresh_cookie(response: Response, token: str, settings: SettingsDep) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        max_age=settings.refresh_token_expire_days * 24 * 3600,
        path=REFRESH_COOKIE_PATH,
        httponly=True,  # not readable from JavaScript
        secure=settings.refresh_cookie_secure,
        samesite=settings.refresh_cookie_samesite,
    )


def clear_refresh_cookie(response: Response, settings: SettingsDep) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE, path=REFRESH_COOKIE_PATH, httponly=True,
        secure=settings.refresh_cookie_secure, samesite=settings.refresh_cookie_samesite,
    )


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: DbDep) -> UserRead:
    try:
        user = auth_service.register_user(db, body)
    except PasswordPolicyError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from None
    except EmailTakenError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists") from None
    db.commit()
    return UserRead.model_validate(user)


@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: DbDep,
    settings: SettingsDep,
    limiter: Annotated[LoginRateLimiter, Depends(get_login_limiter)],
) -> TokenResponse:
    ip = client_ip(request)
    wait = limiter.retry_after(body.email, ip)
    if wait is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again later.",
            headers={"Retry-After": str(wait)},
        )
    limiter.by_ip.record(ip)
    user = auth_service.authenticate(db, body.email, body.password.get_secret_value())
    if user is None:
        limiter.by_email.record(body.email)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_INVALID_LOGIN)
    limiter.by_email.reset(body.email)

    refresh = auth_service.issue_refresh_token(db, user.id, settings)
    db.commit()
    access, lifetime = create_access_token(user.id, settings)
    set_refresh_cookie(response, refresh, settings)
    return TokenResponse(access_token=access, expires_in=lifetime)


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    response: Response,
    db: DbDep,
    settings: SettingsDep,
    ecohealth_refresh: Annotated[str | None, Cookie()] = None,
) -> TokenResponse:
    if not ecohealth_refresh:
        raise _INVALID_REFRESH
    result = auth_service.rotate_refresh_token(db, ecohealth_refresh, settings, now=datetime.now(UTC))
    if result.status is RefreshStatus.REUSED:
        db.commit()  # persist the family revocation BEFORE rejecting
        clear_refresh_cookie(response, settings)
        raise _INVALID_REFRESH
    if result.status is not RefreshStatus.VALID:
        raise _INVALID_REFRESH
    db.commit()
    access, lifetime = create_access_token(result.user_id, settings)
    set_refresh_cookie(response, result.new_token, settings)
    return TokenResponse(access_token=access, expires_in=lifetime)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    db: DbDep,
    settings: SettingsDep,
    ecohealth_refresh: Annotated[str | None, Cookie()] = None,
) -> Response:
    auth_service.logout(db, ecohealth_refresh)
    db.commit()
    response.status_code = status.HTTP_204_NO_CONTENT
    clear_refresh_cookie(response, settings)
    return response
