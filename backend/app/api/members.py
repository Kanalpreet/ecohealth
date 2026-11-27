"""/members and /members/{member_id}/routines: CRUD scoped to the current user.

Another user's member or routine returns 404, exactly like a missing one.
"""

import uuid

from fastapi import APIRouter, HTTPException, Response, status

from app.api.deps import CurrentUser, DbDep
from app.models import FamilyMember, User
from app.schemas.family_member import FamilyMemberCreate, FamilyMemberRead, FamilyMemberUpdate
from app.schemas.routine import RoutineCreate, RoutineRead, RoutineUpdate
from app.services import family
from app.services.family import LimitReachedError, NotFoundError

router = APIRouter(prefix="/members", tags=["members"])

_MEMBER_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
_ROUTINE_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routine not found")


def owned_member(db: DbDep, user: User, member_id: uuid.UUID) -> FamilyMember:
    try:
        return family.get_member(db, user, member_id)
    except NotFoundError:
        raise _MEMBER_NOT_FOUND from None


# ---- members ----


@router.get("", response_model=list[FamilyMemberRead])
def list_members(user: CurrentUser, db: DbDep) -> list[FamilyMemberRead]:
    return [FamilyMemberRead.model_validate(m) for m in family.list_members(db, user)]


@router.post("", response_model=FamilyMemberRead, status_code=status.HTTP_201_CREATED)
def create_member(body: FamilyMemberCreate, user: CurrentUser, db: DbDep) -> FamilyMemberRead:
    try:
        member = family.create_member(db, user, body.model_dump())
    except LimitReachedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None
    db.commit()
    db.refresh(member)
    return FamilyMemberRead.model_validate(member)


@router.get("/{member_id}", response_model=FamilyMemberRead)
def read_member(member_id: uuid.UUID, user: CurrentUser, db: DbDep) -> FamilyMemberRead:
    return FamilyMemberRead.model_validate(owned_member(db, user, member_id))


@router.patch("/{member_id}", response_model=FamilyMemberRead)
def update_member(member_id: uuid.UUID, body: FamilyMemberUpdate, user: CurrentUser, db: DbDep) -> FamilyMemberRead:
    member = owned_member(db, user, member_id)
    family.update_member(db, member, body.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(member)
    return FamilyMemberRead.model_validate(member)


@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_member(member_id: uuid.UUID, user: CurrentUser, db: DbDep) -> Response:
    db.delete(owned_member(db, user, member_id))  # routines cascade in PostgreSQL
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---- routines ----


@router.get("/{member_id}/routines", response_model=list[RoutineRead])
def list_routines(member_id: uuid.UUID, user: CurrentUser, db: DbDep) -> list[RoutineRead]:
    member = owned_member(db, user, member_id)
    return [RoutineRead.model_validate(r) for r in family.list_routines(db, member)]


@router.post("/{member_id}/routines", response_model=RoutineRead, status_code=status.HTTP_201_CREATED)
def create_routine(member_id: uuid.UUID, body: RoutineCreate, user: CurrentUser, db: DbDep) -> RoutineRead:
    member = owned_member(db, user, member_id)
    try:
        routine = family.create_routine(db, member, body.model_dump())
    except LimitReachedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None
    db.commit()
    db.refresh(routine)
    return RoutineRead.model_validate(routine)


def owned_routine(db: DbDep, user: User, member_id: uuid.UUID, routine_id: uuid.UUID):
    try:
        return family.get_routine(db, user, member_id, routine_id)
    except NotFoundError:
        raise _ROUTINE_NOT_FOUND from None


@router.get("/{member_id}/routines/{routine_id}", response_model=RoutineRead)
def read_routine(member_id: uuid.UUID, routine_id: uuid.UUID, user: CurrentUser, db: DbDep) -> RoutineRead:
    return RoutineRead.model_validate(owned_routine(db, user, member_id, routine_id))


@router.patch("/{member_id}/routines/{routine_id}", response_model=RoutineRead)
def update_routine(
    member_id: uuid.UUID, routine_id: uuid.UUID, body: RoutineUpdate, user: CurrentUser, db: DbDep
) -> RoutineRead:
    routine = owned_routine(db, user, member_id, routine_id)
    family.update_routine(db, routine, body.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(routine)
    return RoutineRead.model_validate(routine)


@router.delete("/{member_id}/routines/{routine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_routine(member_id: uuid.UUID, routine_id: uuid.UUID, user: CurrentUser, db: DbDep) -> Response:
    db.delete(owned_routine(db, user, member_id, routine_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
