"""Auth and account API schemas. Passwords are SecretStr; hashes never appear here."""

from typing import Literal, Self

from pydantic import AwareDatetime, BaseModel, EmailStr, Field, SecretStr, field_validator, model_validator

from app.core.constants import PASSWORD_MAX_LENGTH
from app.schemas.common import InputSchema
from app.schemas.family_member import FamilyMemberRead
from app.schemas.routine import RoutineRead
from app.schemas.user import UserCreate, UserRead


class RegisterRequest(UserCreate):
    """Sign-up body: UserCreate plus explicit consent (sets users.consent_at)."""

    consent: bool

    @model_validator(mode="after")
    def consent_required(self) -> Self:
        if self.consent is not True:
            raise ValueError("consent is required to create an account")
        return self


class LoginRequest(InputSchema):
    email: EmailStr
    # No minimum here (old passwords may predate the policy); max bounds hashing work.
    password: SecretStr = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: str) -> str:
        return value.lower()


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int  # seconds


class MemberExport(FamilyMemberRead):
    routines: list[RoutineRead]


class UserExport(BaseModel):
    """GET /me/export: all of the user's data. No password hash, no tokens."""

    exported_at: AwareDatetime
    user: UserRead
    members: list[MemberExport]


class MessageResponse(BaseModel):
    detail: str


__all__ = [
    "LoginRequest",
    "MemberExport",
    "MessageResponse",
    "RegisterRequest",
    "TokenResponse",
    "UserExport",
]
