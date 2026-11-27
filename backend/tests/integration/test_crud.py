"""CRUD, cascade, trigger and constraint tests against the real Supabase schema.

Each test runs in a rolled-back transaction (see conftest.py).
"""

from datetime import datetime, time
from decimal import Decimal

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import DataError, IntegrityError

from app.models import FamilyMember, Routine, User
from tests.integration.conftest import unique_email

pytestmark = pytest.mark.integration

FAKE_HASH = "fake-hash-not-real"


def add_user(session, **overrides) -> User:
    user = User(**{"name": "Test User", "email": unique_email(), "password_hash": FAKE_HASH, **overrides})
    session.add(user)
    session.flush()
    session.refresh(user)  # load server-generated values (timestamps)
    return user


def add_member(session, user, **overrides) -> FamilyMember:
    member = FamilyMember(**{"user": user, "name": "Test Child", "age": 8, **overrides})
    session.add(member)
    session.flush()
    session.refresh(member)
    return member


def add_routine(session, member, **overrides) -> Routine:
    routine = Routine(
        **{"member": member, "activity": "school walk", "start_time": time(7, 30), "days_of_week": ["mon"], **overrides}
    )
    session.add(routine)
    session.flush()
    session.refresh(routine)
    return routine


def constraint_name(exc_info) -> str | None:
    """Name of the violated constraint (from the driver's diagnostics, no data)."""
    return getattr(getattr(exc_info.value.orig, "diag", None), "constraint_name", None)


# ---- CRUD ----


def test_user_crud_and_defaults(db_session):
    user = add_user(db_session, home_lat=Decimal("28.61"), home_lon=Decimal("77.21"))
    assert user.id is not None
    assert user.timezone == "Asia/Kolkata"
    assert user.created_at.tzinfo is not None and user.updated_at.tzinfo is not None
    assert user.consent_at is None

    db_session.expire_all()
    loaded = db_session.get(User, user.id)
    assert loaded.home_lat == Decimal("28.61") and loaded.home_lon == Decimal("77.21")

    loaded.name = "Renamed User"
    loaded.timezone = "Europe/London"
    db_session.flush()
    db_session.expire_all()
    assert db_session.get(User, user.id).name == "Renamed User"

    db_session.delete(loaded)
    db_session.flush()
    db_session.expire_all()
    assert db_session.get(User, user.id) is None


def test_family_member_crud_and_array_mutation(db_session):
    user = add_user(db_session)
    member = add_member(db_session, user, conditions=["asthma"])
    assert member.sensitivity == 1.0  # server/python default
    assert member.conditions == ["asthma"]

    member.conditions.append("heart_disease")  # in-place edit must be saved (MutableList)
    member.age = 9
    db_session.flush()
    db_session.expire_all()
    loaded = db_session.get(FamilyMember, member.id)
    assert loaded.conditions == ["asthma", "heart_disease"]
    assert loaded.age == 9

    db_session.delete(loaded)
    db_session.flush()
    assert db_session.get(FamilyMember, member.id) is None


def test_routine_crud(db_session):
    member = add_member(db_session, add_user(db_session))
    routine = add_routine(db_session, member, days_of_week=["mon", "wed"])
    assert routine.start_time == time(7, 30) and routine.start_time.tzinfo is None

    routine.days_of_week.append("fri")
    routine.start_time = time(18, 15)
    db_session.flush()
    db_session.expire_all()
    loaded = db_session.get(Routine, routine.id)
    assert loaded.days_of_week == ["mon", "wed", "fri"]
    assert loaded.start_time == time(18, 15)

    db_session.delete(loaded)
    db_session.flush()
    assert db_session.get(Routine, routine.id) is None


def test_coordinates_are_rounded_by_the_column(db_session):
    user = add_user(db_session, home_lat=Decimal("0"), home_lon=Decimal("0"))
    # Bypass the schemas entirely: the numeric(5,2)/(6,2) columns still round.
    db_session.execute(
        text("UPDATE public.users SET home_lat = 28.6149, home_lon = 77.205 WHERE id = :id"), {"id": user.id}
    )
    db_session.expire_all()
    loaded = db_session.get(User, user.id)
    assert (loaded.home_lat, loaded.home_lon) == (Decimal("28.61"), Decimal("77.21"))


# ---- Cascades ----


def _count(session, model, **filters) -> int:
    stmt = select(func.count()).select_from(model).filter_by(**filters)
    return session.execute(stmt).scalar_one()


def test_deleting_user_cascades_to_members_and_routines(db_session):
    user = add_user(db_session)
    member = add_member(db_session, user)
    add_routine(db_session, member)
    add_routine(db_session, member, days_of_week=["sat"])

    db_session.delete(user)  # ORM delete; passive_deletes leaves it to ON DELETE CASCADE
    db_session.flush()

    assert _count(db_session, FamilyMember, user_id=user.id) == 0
    assert _count(db_session, Routine, member_id=member.id) == 0


def test_database_level_cascade_with_raw_sql(db_session):
    user = add_user(db_session)
    member = add_member(db_session, user)
    add_routine(db_session, member)

    db_session.execute(text("DELETE FROM public.users WHERE id = :id"), {"id": user.id})

    assert _count(db_session, FamilyMember, id=member.id) == 0
    assert _count(db_session, Routine, member_id=member.id) == 0


# ---- updated_at trigger ----


def _updated_at(session, table: str, row_id) -> datetime:
    return session.execute(
        text(f"SELECT updated_at FROM public.{table} WHERE id = :id"), {"id": row_id}
    ).scalar_one()


@pytest.mark.parametrize(
    ("table", "column", "value"),
    [("users", "name", "Raw Update"), ("family_members", "age", 10), ("routines", "activity", "cycling")],
)
def test_updated_at_trigger_fires_on_raw_sql_update(db_session, table, column, value):
    user = add_user(db_session)
    member = add_member(db_session, user)
    routine = add_routine(db_session, member)
    row_id = {"users": user.id, "family_members": member.id, "routines": routine.id}[table]

    before = _updated_at(db_session, table, row_id)
    db_session.execute(text(f"UPDATE public.{table} SET {column} = :v WHERE id = :id"), {"v": value, "id": row_id})
    after = _updated_at(db_session, table, row_id)

    assert after > before


def test_updated_at_changes_after_orm_update(db_session):
    user = add_user(db_session)
    before = user.updated_at
    user.name = "ORM Update"
    db_session.flush()
    db_session.refresh(user)
    assert user.updated_at > before
    assert user.created_at <= before  # created_at is not touched


# ---- Constraint failures ----


def test_duplicate_email_is_rejected(db_session):
    email = unique_email()
    add_user(db_session, email=email)
    with pytest.raises(IntegrityError) as exc_info:
        add_user(db_session, email=email)
    assert constraint_name(exc_info) == "uq_users_email"


def test_uppercase_email_is_rejected_by_database(db_session):
    with pytest.raises(IntegrityError) as exc_info:
        add_user(db_session, email=unique_email().upper())
    assert constraint_name(exc_info) == "ck_users_email_lowercase"


@pytest.mark.parametrize(
    ("days", "constraint"),
    [(["xyz"], "ck_routines_days_of_week_valid"), (["mon", "Fun"], "ck_routines_days_of_week_valid"),
     ([], "ck_routines_days_of_week_not_empty")],
)
def test_invalid_days_of_week_are_rejected(db_session, days, constraint):
    member = add_member(db_session, add_user(db_session))
    with pytest.raises(IntegrityError) as exc_info:
        add_routine(db_session, member, days_of_week=days)
    assert constraint_name(exc_info) == constraint


@pytest.mark.parametrize("age", [-1, 121])
def test_invalid_age_is_rejected(db_session, age):
    user = add_user(db_session)
    with pytest.raises(IntegrityError) as exc_info:
        add_member(db_session, user, age=age)
    assert constraint_name(exc_info) == "ck_family_members_age_range"


@pytest.mark.parametrize(
    ("lat", "lon", "constraint"),
    [
        (Decimal("90.01"), Decimal("0"), "ck_users_home_lat_range"),
        (Decimal("-95"), Decimal("0"), "ck_users_home_lat_range"),
        (Decimal("0"), Decimal("180.01"), "ck_users_home_lon_range"),
        (Decimal("0"), Decimal("-181"), "ck_users_home_lon_range"),
        (Decimal("10"), None, "ck_users_home_coordinates_together"),
    ],
)
def test_out_of_range_coordinates_are_rejected(db_session, lat, lon, constraint):
    with pytest.raises(IntegrityError) as exc_info:
        add_user(db_session, home_lat=lat, home_lon=lon)
    assert constraint_name(exc_info) == constraint


def test_coordinate_beyond_numeric_precision_is_rejected(db_session):
    # 1000.00 does not fit numeric(5,2): rejected before the CHECK even runs.
    with pytest.raises(DataError):
        add_user(db_session, home_lat=Decimal("1000"), home_lon=Decimal("0"))


def test_member_requires_existing_user(db_session):
    import uuid

    member = FamilyMember(user_id=uuid.uuid4(), name="Orphan", age=5)
    db_session.add(member)
    with pytest.raises(IntegrityError) as exc_info:
        db_session.flush()
    assert constraint_name(exc_info) == "fk_family_members_user_id_users"
