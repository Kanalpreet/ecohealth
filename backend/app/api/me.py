"""/me: current user's profile, deletion and data export."""

from datetime import UTC, datetime

from fastapi import APIRouter, Response, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.auth import clear_refresh_cookie
from app.api.deps import CurrentUser, DbDep, SettingsDep
from app.models import FamilyMember
from app.schemas.auth import MemberExport, UserExport
from app.schemas.user import UserRead, UserUpdate

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=UserRead)
def read_me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@router.patch("", response_model=UserRead)
def update_me(body: UserUpdate, user: CurrentUser, db: DbDep) -> UserRead:
    # exclude_unset: omitted fields stay unchanged (a plain model_dump would null them).
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return UserRead.model_validate(user)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(user: CurrentUser, db: DbDep, response: Response, settings: SettingsDep) -> Response:
    """Delete the account and ALL its data (members, routines, refresh tokens cascade)."""
    db.delete(user)
    db.commit()
    response.status_code = status.HTTP_204_NO_CONTENT
    clear_refresh_cookie(response, settings)
    return response


@router.get("/export", response_model=UserExport)
def export_me(user: CurrentUser, db: DbDep) -> UserExport:
    members = db.execute(
        select(FamilyMember)
        .where(FamilyMember.user_id == user.id)
        .options(selectinload(FamilyMember.routines))
        .order_by(FamilyMember.created_at)
    ).scalars()
    return UserExport(
        exported_at=datetime.now(UTC),
        user=UserRead.model_validate(user),
        members=[MemberExport.model_validate(m) for m in members],  # nested routines via from_attributes
    )
