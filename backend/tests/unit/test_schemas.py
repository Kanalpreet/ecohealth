"""Unit tests for Pydantic schemas. All data is synthetic."""

import uuid
from decimal import Decimal
from datetime import UTC, datetime, time

import pytest
from pydantic import BaseModel, ValidationError

import app.schemas as schemas
from app.models import FamilyMember, Routine, User
from app.schemas import (
    FamilyMemberCreate,
    FamilyMemberRead,
    FamilyMemberUpdate,
    RoutineCreate,
    RoutineRead,
    RoutineUpdate,
    UserCreate,
    UserRead,
    UserUpdate,
)

pytestmark = pytest.mark.unit

FAKE_HASH = "fake-hash-$argon2id$not-real"
NOW = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
VALID_USER = {"name": "Test User", "email": "test.user@example.com", "password": "correct-horse"}


def user_create(**overrides):
    return UserCreate(**{**VALID_USER, **overrides})


# ---- UserCreate ----


def test_user_create_valid_and_email_lowercased():
    user = user_create(email="Test.User@Example.COM", name="  Test User  ")
    assert user.email == "test.user@example.com"
    assert user.name == "Test User"


@pytest.mark.parametrize("email", ["not-an-email", "a@", "@example.com", ""])
def test_user_create_rejects_invalid_email(email):
    with pytest.raises(ValidationError):
        user_create(email=email)


@pytest.mark.parametrize("name", ["", "   ", "x" * 101])
def test_user_create_rejects_bad_name(name):
    with pytest.raises(ValidationError):
        user_create(name=name)


@pytest.mark.parametrize(("password", "ok"), [("x" * 7, False), ("x" * 8, True), ("x" * 128, True), ("x" * 129, False)])
def test_user_create_password_length_boundaries(password, ok):
    if ok:
        assert user_create(password=password).password.get_secret_value() == password
    else:
        with pytest.raises(ValidationError):
            user_create(password=password)


def test_user_create_password_is_masked():
    user = user_create(password="super-secret-pw")
    for output in (repr(user), str(user), user.model_dump_json()):
        assert "super-secret-pw" not in output


@pytest.mark.parametrize(
    ("lat", "lon", "ok"),
    [(90.0, 180.0, True), (-90.0, -180.0, True), (90.01, 0.0, False), (0.0, 180.01, False), (float("nan"), 0.0, False)],
)
def test_user_create_coordinate_boundaries(lat, lon, ok):
    if ok:
        user_create(home_lat=lat, home_lon=lon)
    else:
        with pytest.raises(ValidationError):
            user_create(home_lat=lat, home_lon=lon)


def test_user_create_rounds_coordinates_to_two_decimals():
    user = user_create(home_lat=28.61394, home_lon=77.20902)
    assert (user.home_lat, user.home_lon) == (Decimal("28.61"), Decimal("77.21"))


@pytest.mark.parametrize(
    ("raw", "expected"),
    [(28.615, "28.62"), ("28.625", "28.63"), (-28.615, "-28.62"), (89.996, "90.00"), (10, "10.00")],
)
def test_coordinate_rounding_is_half_up_and_exact(raw, expected):
    assert user_create(home_lat=raw, home_lon=0).home_lat == Decimal(expected)


@pytest.mark.parametrize("bad", [float("inf"), float("-inf"), "abc", "90.001"])
def test_coordinates_reject_infinity_garbage_and_out_of_range_strings(bad):
    with pytest.raises(ValidationError):
        user_create(home_lat=bad, home_lon=0)


def test_user_read_returns_coordinates_as_json_numbers():
    read = UserRead.model_validate(make_user())
    assert isinstance(read.home_lat, float)
    assert '"home_lat":28.61' in read.model_dump_json()


@pytest.mark.parametrize("coords", [{"home_lat": 10.0}, {"home_lon": 10.0}])
def test_user_create_requires_both_coordinates(coords):
    with pytest.raises(ValidationError, match="together"):
        user_create(**coords)


@pytest.mark.parametrize("field", ["password_hash", "id", "consent_at", "created_at", "role"])
def test_user_create_rejects_internal_fields(field):
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        user_create(**{field: "x"})


# ---- UserUpdate ----


def test_user_update_partial_and_empty():
    assert UserUpdate(name="New Name").model_dump(exclude_unset=True) == {"name": "New Name"}
    assert UserUpdate().model_dump(exclude_unset=True) == {}


def test_user_update_coordinates_must_change_together():
    assert UserUpdate(home_lat=1.0, home_lon=2.0).home_lat == Decimal("1.00")
    assert UserUpdate(home_lat=None, home_lon=None).model_dump(exclude_unset=True) == {
        "home_lat": None,
        "home_lon": None,
    }
    for bad in ({"home_lat": 1.0}, {"home_lat": 1.0, "home_lon": None}):
        with pytest.raises(ValidationError, match="together"):
            UserUpdate(**bad)


def test_user_update_rounds_coordinates():
    update = UserUpdate(home_lat=28.61394, home_lon=77.20902)
    assert (update.home_lat, update.home_lon) == (Decimal("28.61"), Decimal("77.21"))


def test_update_must_be_applied_with_exclude_unset():
    """Services must use model_dump(exclude_unset=True): a plain model_dump()
    would turn omitted coordinates into None and erase the home location."""
    update = UserUpdate(name="New Name")
    assert update.model_dump(exclude_unset=True) == {"name": "New Name"}
    assert update.model_dump()["home_lat"] is None  # the trap being guarded against


# ---- Time zone ----


def test_user_create_timezone_defaults_to_asia_kolkata():
    assert user_create().timezone == "Asia/Kolkata"


@pytest.mark.parametrize("tz", ["Asia/Kolkata", "Europe/London", "America/New_York", "UTC", " Asia/Tokyo "])
def test_user_create_accepts_iana_timezones(tz):
    assert user_create(timezone=tz).timezone == tz.strip()


@pytest.mark.parametrize(
    "tz",
    ["", "   ", "IST", "Asia/Kalkota", "asia/kolkata", "+05:30", "../../etc/passwd", "Asia/" + "x" * 64],
)
def test_user_create_rejects_invalid_timezones(tz):
    with pytest.raises(ValidationError):
        user_create(timezone=tz)


def test_user_update_timezone_optional_but_not_null():
    assert UserUpdate(timezone="Europe/Paris").timezone == "Europe/Paris"
    assert UserUpdate().model_dump(exclude_unset=True) == {}
    with pytest.raises(ValidationError, match="cannot be null"):
        UserUpdate(timezone=None)
    with pytest.raises(ValidationError, match="IANA"):
        UserUpdate(timezone="Mars/Olympus")


def test_user_read_includes_timezone():
    assert UserRead.model_validate(make_user()).timezone == "Asia/Kolkata"


def test_user_update_rejects_null_name_and_email_change():
    with pytest.raises(ValidationError, match="cannot be null"):
        UserUpdate(name=None)
    with pytest.raises(ValidationError, match="Extra inputs"):
        UserUpdate(email="new@example.com")


# ---- UserRead: password_hash must never appear ----


def make_user() -> User:
    return User(
        id=uuid.uuid4(),
        name="Test User",
        email="test.user@example.com",
        password_hash=FAKE_HASH,
        home_lat=Decimal("28.61"),
        home_lon=Decimal("77.21"),
        timezone="Asia/Kolkata",  # Python-side defaults apply only on flush
        consent_at=None,
        created_at=NOW,
        updated_at=NOW,
    )


def test_user_read_from_orm_excludes_password_hash():
    read = UserRead.model_validate(make_user())
    dumped = read.model_dump()
    assert "password_hash" not in dumped
    assert FAKE_HASH not in read.model_dump_json()
    assert dumped["email"] == "test.user@example.com"


def test_user_read_from_dict_drops_password_hash():
    data = {
        "id": uuid.uuid4(),
        "name": "Test User",
        "email": "test.user@example.com",
        "password_hash": FAKE_HASH,
        "home_lat": None,
        "home_lon": None,
        "timezone": "Asia/Kolkata",
        "consent_at": None,
        "created_at": NOW,
        "updated_at": NOW,
    }
    read = UserRead.model_validate(data)
    assert "password_hash" not in read.model_dump()
    assert FAKE_HASH not in read.model_dump_json()


FORBIDDEN_RESPONSE_FIELD_PARTS = ("password", "hash", "secret", "token")


def test_no_read_schema_declares_credential_fields():
    read_schemas = [
        c
        for name in schemas.__all__
        if name.endswith("Read") and isinstance(c := getattr(schemas, name), type) and issubclass(c, BaseModel)
    ]
    assert read_schemas, "no Read schemas found"
    for schema in read_schemas:
        for field in schema.model_fields:
            assert not any(part in field for part in FORBIDDEN_RESPONSE_FIELD_PARTS), f"{schema.__name__}.{field}"


def test_user_read_requires_timezone_aware_timestamps():
    user = make_user()
    user.created_at = datetime(2026, 1, 1, 12, 0)  # naive
    with pytest.raises(ValidationError):
        UserRead.model_validate(user)


# ---- FamilyMember ----


def test_family_member_create_defaults_and_normalisation():
    member = FamilyMemberCreate(name="Test Child", age=8, conditions=[" Asthma ", "asthma", "heart_disease"])
    assert member.conditions == ["asthma", "heart_disease"]
    assert member.sensitivity == 1.0
    assert FamilyMemberCreate(name="Test Adult", age=30).conditions == []


@pytest.mark.parametrize(("age", "ok"), [(0, True), (120, True), (-1, False), (121, False)])
def test_family_member_age_boundaries(age, ok):
    if ok:
        FamilyMemberCreate(name="Test", age=age)
    else:
        with pytest.raises(ValidationError):
            FamilyMemberCreate(name="Test", age=age)


@pytest.mark.parametrize(("value", "ok"), [(0.5, True), (2.0, True), (0.49, False), (2.01, False)])
def test_family_member_sensitivity_boundaries(value, ok):
    if ok:
        FamilyMemberCreate(name="Test", age=10, sensitivity=value)
    else:
        with pytest.raises(ValidationError):
            FamilyMemberCreate(name="Test", age=10, sensitivity=value)


@pytest.mark.parametrize(
    "conditions",
    [["has space"], ["1asthma"], ["x" * 51], [f"c{i}" for i in range(11)], ["a-b"]],
)
def test_family_member_rejects_invalid_conditions(conditions):
    with pytest.raises(ValidationError):
        FamilyMemberCreate(name="Test", age=10, conditions=conditions)


@pytest.mark.parametrize("field", ["user_id", "id", "created_at"])
def test_family_member_create_rejects_ownership_and_internal_fields(field):
    with pytest.raises(ValidationError, match="Extra inputs"):
        FamilyMemberCreate(name="Test", age=10, **{field: str(uuid.uuid4())})


def test_family_member_update_rejects_nulls():
    assert FamilyMemberUpdate(age=12).model_dump(exclude_unset=True) == {"age": 12}
    with pytest.raises(ValidationError, match="cannot be null"):
        FamilyMemberUpdate(conditions=None)


def test_family_member_update_normalises_conditions_and_allows_clearing():
    assert FamilyMemberUpdate(conditions=["Asthma", "asthma"]).conditions == ["asthma"]
    assert FamilyMemberUpdate(conditions=[]).conditions == []


@pytest.mark.parametrize(
    "build",
    [
        lambda: FamilyMemberCreate(name="Test", age=True),
        lambda: FamilyMemberCreate(name="Test", age=10, sensitivity=True),
        lambda: FamilyMemberUpdate(age=False),
        lambda: user_create(home_lat=True, home_lon=False),
        lambda: UserUpdate(home_lat=True, home_lon=True),
    ],
)
def test_numeric_fields_reject_booleans(build):
    with pytest.raises(ValidationError, match="not a boolean"):
        build()


def test_family_member_read_from_orm():
    member = FamilyMember(
        id=uuid.uuid4(), user_id=uuid.uuid4(), name="Test", age=9, conditions=["asthma"], sensitivity=1.2, created_at=NOW, updated_at=NOW
    )
    read = FamilyMemberRead.model_validate(member)
    assert read.conditions == ["asthma"] and read.user_id == member.user_id


# ---- Routine ----


def test_routine_create_days_normalised_and_sorted():
    routine = RoutineCreate(activity=" Morning walk ", start_time="07:30", days_of_week=["Sun", "mon", "sun"])
    assert routine.days_of_week == ["mon", "sun"]
    assert routine.activity == "Morning walk"
    assert routine.start_time == time(7, 30)


@pytest.mark.parametrize("days", [[], ["funday"], ["monday"], ["mon"] * 8])
def test_routine_rejects_invalid_days_of_week(days):
    with pytest.raises(ValidationError):
        RoutineCreate(activity="walk", start_time="07:30", days_of_week=days)


def test_routine_rejects_timezone_aware_start_time():
    with pytest.raises(ValidationError, match="time zone"):
        RoutineCreate(activity="walk", start_time="07:30+05:30", days_of_week=["mon"])


@pytest.mark.parametrize("activity", ["", "  ", "x" * 101])
def test_routine_rejects_bad_activity(activity):
    with pytest.raises(ValidationError):
        RoutineCreate(activity=activity, start_time="07:30", days_of_week=["mon"])


def test_routine_create_rejects_member_id():
    with pytest.raises(ValidationError, match="Extra inputs"):
        RoutineCreate(activity="walk", start_time="07:30", days_of_week=["mon"], member_id=str(uuid.uuid4()))


def test_routine_update_partial_and_nulls():
    assert RoutineUpdate(days_of_week=["fri", "mon"]).days_of_week == ["mon", "fri"]
    with pytest.raises(ValidationError, match="cannot be null"):
        RoutineUpdate(start_time=None)


def test_routine_update_rejects_timezone_aware_start_time():
    with pytest.raises(ValidationError, match="time zone"):
        RoutineUpdate(start_time="07:30+05:30")


def test_routine_read_from_orm():
    routine = Routine(id=uuid.uuid4(), member_id=uuid.uuid4(), activity="cycling", start_time=time(18, 0), days_of_week=["sat"], created_at=NOW, updated_at=NOW)
    assert RoutineRead.model_validate(routine).days_of_week == ["sat"]
