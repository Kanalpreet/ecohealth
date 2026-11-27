"""Routine model: a recurring activity of a family member."""

import uuid
from datetime import datetime, time
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Time, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.mutable import MutableList
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import ACTIVITY_MAX_LENGTH, WEEKDAYS
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.family_member import FamilyMember

_WEEKDAY_ARRAY_SQL = "ARRAY[" + ", ".join(f"'{d}'" for d in WEEKDAYS) + "]::varchar[]"


class Routine(Base):
    __tablename__ = "routines"
    __table_args__ = (
        CheckConstraint(f"days_of_week <@ {_WEEKDAY_ARRAY_SQL}", name="days_of_week_valid"),
        CheckConstraint("cardinality(days_of_week) >= 1", name="days_of_week_not_empty"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("family_members.id", ondelete="CASCADE"), index=True
    )
    activity: Mapped[str] = mapped_column(String(ACTIVITY_MAX_LENGTH))
    # Local wall-clock time of day (no time zone), interpreted in the owning
    # user's time zone (User.timezone).
    start_time: Mapped[time] = mapped_column(Time(timezone=False))
    days_of_week: Mapped[list[str]] = mapped_column(MutableList.as_mutable(ARRAY(String(3))))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    member: Mapped["FamilyMember"] = relationship(back_populates="routines")

    def __repr__(self) -> str:
        return f"Routine(id={self.id!s})"
