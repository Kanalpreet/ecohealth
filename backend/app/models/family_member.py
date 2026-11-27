"""Family member model (sensitive: health-related data)."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Integer, String, func, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.mutable import MutableList
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import (
    AGE_MAX,
    AGE_MIN,
    CONDITION_CODE_MAX_LENGTH,
    NAME_MAX_LENGTH,
    SENSITIVITY_DEFAULT,
    SENSITIVITY_MAX,
    SENSITIVITY_MIN,
)
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.routine import Routine
    from app.models.user import User


class FamilyMember(Base):
    __tablename__ = "family_members"
    __table_args__ = (
        CheckConstraint(f"age BETWEEN {AGE_MIN} AND {AGE_MAX}", name="age_range"),
        CheckConstraint(
            f"sensitivity BETWEEN {SENSITIVITY_MIN} AND {SENSITIVITY_MAX}", name="sensitivity_range"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    # Indexed: every ownership query filters by user_id. CASCADE: a member's
    # data has no meaning (and must not linger) once the account is deleted.
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH))
    age: Mapped[int] = mapped_column(Integer)
    # MutableList: without it, in-place edits like .append() are silently not saved.
    conditions: Mapped[list[str]] = mapped_column(
        MutableList.as_mutable(ARRAY(String(CONDITION_CODE_MAX_LENGTH))),
        default=list,
        server_default=text("'{}'"),
    )
    sensitivity: Mapped[float] = mapped_column(
        Float, default=SENSITIVITY_DEFAULT, server_default=text(str(SENSITIVITY_DEFAULT))
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="family_members")
    routines: Mapped[list["Routine"]] = relationship(
        back_populates="member",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:  # id only: no name, age or health data
        return f"FamilyMember(id={self.id!s})"
