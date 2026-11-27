"""Family member API schemas. user_id is never accepted from clients."""

import uuid
from typing import Annotated, Self

from pydantic import (
    AwareDatetime,
    BeforeValidator,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.core.constants import (
    AGE_MAX,
    AGE_MIN,
    CONDITION_CODE_MAX_LENGTH,
    CONDITION_CODE_PATTERN,
    MAX_CONDITIONS,
    SENSITIVITY_DEFAULT,
    SENSITIVITY_MAX,
    SENSITIVITY_MIN,
)
from app.schemas.common import InputSchema, Name, NotBool, ReadSchema, dedupe, reject_explicit_nulls


def _normalise_code(value: object) -> object:
    # Runs BEFORE the pattern check (StringConstraints' to_lower would run after it).
    return value.strip().lower() if isinstance(value, str) else value


ConditionCode = Annotated[
    str,
    BeforeValidator(_normalise_code),
    StringConstraints(min_length=1, max_length=CONDITION_CODE_MAX_LENGTH, pattern=CONDITION_CODE_PATTERN),
]
Age = Annotated[int, NotBool, Field(ge=AGE_MIN, le=AGE_MAX)]
Sensitivity = Annotated[float, NotBool, Field(ge=SENSITIVITY_MIN, le=SENSITIVITY_MAX)]
Conditions = Annotated[list[ConditionCode], Field(max_length=MAX_CONDITIONS)]


class FamilyMemberCreate(InputSchema):
    name: Name
    age: Age
    conditions: Conditions = Field(default_factory=list)
    sensitivity: Sensitivity = SENSITIVITY_DEFAULT

    _dedupe = field_validator("conditions")(dedupe)


class FamilyMemberUpdate(InputSchema):
    name: Name | None = None
    age: Age | None = None
    conditions: Conditions | None = None
    sensitivity: Sensitivity | None = None

    @field_validator("conditions")
    @classmethod
    def dedupe_conditions(cls, value: list[str] | None) -> list[str] | None:
        return None if value is None else dedupe(value)

    @model_validator(mode="after")
    def no_nulls(self) -> Self:
        reject_explicit_nulls(self, ("name", "age", "conditions", "sensitivity"))
        return self


class FamilyMemberRead(ReadSchema):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    age: int
    conditions: list[str]
    sensitivity: float
    created_at: AwareDatetime
    updated_at: AwareDatetime
