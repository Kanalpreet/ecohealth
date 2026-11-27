"""Unit tests for ORM models. No database: structure is checked through
SQLAlchemy metadata and by compiling PostgreSQL DDL."""

import uuid
from datetime import time

import pytest
from sqlalchemy import DateTime, Uuid, inspect
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.mutable import MutableList
from sqlalchemy.orm import configure_mappers
from sqlalchemy.schema import CreateTable

from app.core.constants import SENSITIVITY_DEFAULT
from app.core.database import Base
from app.models import FamilyMember, Routine, User

pytestmark = pytest.mark.unit

TABLES = {"users": User, "family_members": FamilyMember, "routines": Routine}


def ddl(model) -> str:
    return str(CreateTable(model.__table__).compile(dialect=postgresql.dialect()))


# ---- Registration ----


def test_all_tables_registered_on_base_metadata():
    assert set(TABLES) <= set(Base.metadata.tables)


def test_mappers_configure_without_errors():
    configure_mappers()  # fails if any relationship/back_populates is misconfigured


# ---- Primary keys ----


@pytest.mark.parametrize("model", TABLES.values())
def test_primary_key_is_uuid_with_python_and_server_defaults(model):
    pk = list(model.__table__.primary_key.columns)
    assert [c.name for c in pk] == ["id"]
    column = pk[0]
    assert isinstance(column.type, Uuid)  # generic type; renders as native UUID on PostgreSQL
    assert column.default.arg.__name__ == "uuid4"
    assert "id UUID DEFAULT gen_random_uuid() NOT NULL" in ddl(model)


# ---- Foreign keys ----


@pytest.mark.parametrize(
    ("model", "column", "target"),
    [(FamilyMember, "user_id", "users.id"), (Routine, "member_id", "family_members.id")],
)
def test_foreign_keys_cascade_are_required_and_indexed(model, column, target):
    col = model.__table__.c[column]
    (fk,) = col.foreign_keys
    assert fk.target_fullname == target
    assert fk.ondelete == "CASCADE"
    assert col.nullable is False
    assert col.index is True


# ---- Relationships ----


@pytest.mark.parametrize(
    ("model", "attr", "target", "back", "uselist"),
    [
        (User, "family_members", FamilyMember, "user", True),
        (FamilyMember, "user", User, "family_members", False),
        (FamilyMember, "routines", Routine, "member", True),
        (Routine, "member", FamilyMember, "routines", False),
    ],
)
def test_relationships_are_paired(model, attr, target, back, uselist):
    rel = inspect(model).relationships[attr]
    assert rel.mapper.class_ is target
    assert rel.back_populates == back
    assert rel.uselist is uselist


@pytest.mark.parametrize(("model", "attr"), [(User, "family_members"), (FamilyMember, "routines")])
def test_parent_to_child_cascade_and_passive_deletes(model, attr):
    rel = inspect(model).relationships[attr]
    assert rel.cascade.delete and rel.cascade.delete_orphan
    assert rel.passive_deletes is True


def test_relationship_assignment_links_both_sides():
    user = User(name="Test User", email="user.a@example.com", password_hash="not-a-real-hash")
    member = FamilyMember(name="Test Child", age=8)
    routine = Routine(activity="school walk", start_time=time(8, 0), days_of_week=["mon"])
    user.family_members.append(member)
    member.routines.append(routine)
    assert member.user is user
    assert routine.member is member


# ---- Users ----


def test_user_email_unique_and_password_hash_required():
    table = User.__table__
    assert table.c.email.unique is True
    assert table.c.password_hash.nullable is False
    assert table.c.name.nullable is False


def test_user_optional_fields_are_nullable():
    table = User.__table__
    for name in ("home_lat", "home_lon", "consent_at"):
        assert table.c[name].nullable is True


def test_user_timezone_column_defaults_to_asia_kolkata():
    col = User.__table__.c.timezone
    assert col.nullable is False
    assert col.type.length == 64
    assert col.default.arg == "Asia/Kolkata"
    assert "timezone VARCHAR(64) DEFAULT 'Asia/Kolkata' NOT NULL" in ddl(User)


@pytest.mark.parametrize(
    ("model", "columns"),
    [
        (User, ("consent_at", "created_at", "updated_at")),
        (FamilyMember, ("created_at", "updated_at")),
        (Routine, ("created_at", "updated_at")),
    ],
)
def test_timestamps_are_timezone_aware(model, columns):
    for name in columns:
        col_type = model.__table__.c[name].type
        assert isinstance(col_type, DateTime) and col_type.timezone is True


@pytest.mark.parametrize("model", TABLES.values())
def test_created_and_updated_at_have_server_defaults_and_onupdate(model):
    table = model.__table__
    assert table.c.created_at.server_default is not None
    assert table.c.updated_at.server_default is not None
    assert table.c.updated_at.onupdate is not None
    sql = ddl(model)
    assert "created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL" in sql
    assert "updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL" in sql


def test_consent_at_has_no_default():
    col = User.__table__.c.consent_at
    assert col.server_default is None and col.default is None  # NULL until consent is given


@pytest.mark.parametrize(("model", "column"), [(User, "email"), (FamilyMember, "user_id"), (Routine, "member_id")])
def test_lookup_columns_are_indexed(model, column):
    col = model.__table__.c[column]
    # A UNIQUE constraint creates an index in PostgreSQL; FKs need an explicit one.
    assert col.unique or col.index


def test_user_check_constraints_in_ddl():
    sql = ddl(User)
    assert "CONSTRAINT ck_users_home_lat_range CHECK (home_lat BETWEEN -90.0 AND 90.0)" in sql
    assert "CONSTRAINT ck_users_home_lon_range CHECK (home_lon BETWEEN -180.0 AND 180.0)" in sql
    assert "CONSTRAINT ck_users_home_coordinates_together" in sql
    assert "CONSTRAINT uq_users_email UNIQUE (email)" in sql
    assert "CONSTRAINT ck_users_email_lowercase CHECK (email = lower(email))" in sql


# ---- Family members ----


def test_family_member_conditions_is_text_array_defaulting_to_empty():
    col = FamilyMember.__table__.c.conditions
    assert isinstance(col.type, ARRAY)
    assert col.nullable is False
    assert col.default.arg.__name__ == "list"
    assert "conditions VARCHAR(50)[] DEFAULT '{}' NOT NULL" in ddl(FamilyMember)


def test_family_member_sensitivity_default_and_checks():
    col = FamilyMember.__table__.c.sensitivity
    assert col.default.arg == SENSITIVITY_DEFAULT
    sql = ddl(FamilyMember)
    assert f"sensitivity FLOAT DEFAULT {SENSITIVITY_DEFAULT} NOT NULL" in sql
    assert "CONSTRAINT ck_family_members_age_range CHECK (age BETWEEN 0 AND 120)" in sql
    assert "CONSTRAINT ck_family_members_sensitivity_range CHECK (sensitivity BETWEEN 0.5 AND 2.0)" in sql
    assert "FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE" in ddl(FamilyMember)


@pytest.mark.parametrize(
    ("factory", "attr", "value"),
    [
        (lambda v: FamilyMember(name="Test Member", age=40, conditions=v), "conditions", ["asthma"]),
        (lambda v: Routine(activity="walk", start_time=time(8, 0), days_of_week=v), "days_of_week", ["mon"]),
    ],
)
def test_array_columns_are_mutation_tracked(factory, attr, value):
    """A plain list would make in-place edits like .append() silently unsaved.

    (Checking attribute history alone is not enough: a freshly constructed
    object always has history, even without MutableList.)
    """
    obj = factory(list(value))
    assert isinstance(getattr(obj, attr), MutableList)
    setattr(obj, attr, ["x"])  # reassignment is coerced too
    assert isinstance(getattr(obj, attr), MutableList)


# ---- Routines ----


def test_routine_columns_and_checks():
    table = Routine.__table__
    assert table.c.start_time.type.timezone is False
    assert isinstance(table.c.days_of_week.type, ARRAY)
    sql = ddl(Routine)
    assert "days_of_week <@ ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']" in sql
    assert "CONSTRAINT ck_routines_days_of_week_not_empty CHECK (cardinality(days_of_week) >= 1)" in sql
    assert "FOREIGN KEY(member_id) REFERENCES family_members (id) ON DELETE CASCADE" in sql


# ---- Privacy ----


def test_reprs_show_only_ids():
    user_id = uuid.uuid4()
    user = User(id=user_id, name="Test User", email="private@example.com", password_hash="secret-hash-value")
    member = FamilyMember(id=uuid.uuid4(), name="Test Member", age=70, conditions=["asthma"])
    assert repr(user) == f"User(id={user_id})"
    for text in ("private@example.com", "secret-hash-value", "Test User"):
        assert text not in repr(user)
    assert "asthma" not in repr(member) and "Test Member" not in repr(member)
