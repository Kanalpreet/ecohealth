"""Members and routines, ALWAYS scoped to their owner (IDOR protection, design.md §5).

Functions never commit; the API layer owns the transaction.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import FamilyMember, Routine, User

MAX_MEMBERS_PER_USER = 10
MAX_ROUTINES_PER_MEMBER = 20


class NotFoundError(Exception):
    """Missing OR owned by someone else: callers return the same 404 for both."""


class LimitReachedError(Exception):
    pass


# ---- members ----


def list_members(db: Session, user: User, with_routines: bool = False) -> list[FamilyMember]:
    stmt = select(FamilyMember).where(FamilyMember.user_id == user.id).order_by(FamilyMember.created_at)
    if with_routines:
        stmt = stmt.options(selectinload(FamilyMember.routines))
    return list(db.execute(stmt).scalars())


def get_member(db: Session, user: User, member_id: uuid.UUID, with_routines: bool = False) -> FamilyMember:
    stmt = select(FamilyMember).where(FamilyMember.id == member_id, FamilyMember.user_id == user.id)
    if with_routines:
        stmt = stmt.options(selectinload(FamilyMember.routines))
    member = db.execute(stmt).scalar_one_or_none()
    if member is None:
        raise NotFoundError
    return member


def create_member(db: Session, user: User, data: dict) -> FamilyMember:
    count = db.execute(select(func.count()).select_from(FamilyMember).where(FamilyMember.user_id == user.id)).scalar_one()
    if count >= MAX_MEMBERS_PER_USER:
        raise LimitReachedError(f"A maximum of {MAX_MEMBERS_PER_USER} family members is allowed")
    member = FamilyMember(user_id=user.id, **data)
    db.add(member)
    db.flush()
    return member


def update_member(db: Session, member: FamilyMember, changes: dict) -> FamilyMember:
    for field, value in changes.items():
        setattr(member, field, value)
    db.flush()
    return member


# ---- routines ----


def list_routines(db: Session, member: FamilyMember) -> list[Routine]:
    stmt = select(Routine).where(Routine.member_id == member.id).order_by(Routine.start_time)
    return list(db.execute(stmt).scalars())


def get_routine(db: Session, user: User, member_id: uuid.UUID, routine_id: uuid.UUID) -> Routine:
    stmt = (
        select(Routine)
        .join(FamilyMember, Routine.member_id == FamilyMember.id)
        .where(Routine.id == routine_id, Routine.member_id == member_id, FamilyMember.user_id == user.id)
    )
    routine = db.execute(stmt).scalar_one_or_none()
    if routine is None:
        raise NotFoundError
    return routine


def create_routine(db: Session, member: FamilyMember, data: dict) -> Routine:
    count = db.execute(select(func.count()).select_from(Routine).where(Routine.member_id == member.id)).scalar_one()
    if count >= MAX_ROUTINES_PER_MEMBER:
        raise LimitReachedError(f"A maximum of {MAX_ROUTINES_PER_MEMBER} routines per member is allowed")
    routine = Routine(member_id=member.id, **data)
    db.add(routine)
    db.flush()
    return routine


def update_routine(db: Session, routine: Routine, changes: dict) -> Routine:
    for field, value in changes.items():
        setattr(routine, field, value)
    db.flush()
    return routine
