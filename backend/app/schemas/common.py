"""Shared building blocks for API schemas."""

from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, StringConstraints

from app.core.constants import NAME_MAX_LENGTH

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=NAME_MAX_LENGTH)]


def _reject_bool(value: object) -> object:
    # Pydantic's lax mode would turn JSON true/false into 1/0; reject that silently bad data.
    if isinstance(value, bool):
        raise ValueError("must be a number, not a boolean")
    return value


NotBool = BeforeValidator(_reject_bool)


class InputSchema(BaseModel):
    """Base for request bodies.

    extra="forbid" rejects unknown fields, so clients cannot set internal or
    ownership fields such as id, user_id, password_hash or consent_at.
    """

    model_config = ConfigDict(extra="forbid")


class ReadSchema(BaseModel):
    """Base for responses. Only explicitly declared fields are copied from ORM objects."""

    model_config = ConfigDict(from_attributes=True)


def reject_explicit_nulls(model: BaseModel, fields: tuple[str, ...]) -> None:
    """In update schemas, omitting a field means "unchanged"; sending null for a
    required database column is an error."""
    for field in fields:
        if field in model.model_fields_set and getattr(model, field) is None:
            raise ValueError(f"{field} cannot be null")


def dedupe(values: list) -> list:
    """Remove duplicates, keeping first-seen order."""
    return list(dict.fromkeys(values))
