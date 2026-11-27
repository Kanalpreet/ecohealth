"""User account model."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, Numeric, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import (
    DEFAULT_TIMEZONE,
    EMAIL_MAX_LENGTH,
    HOME_COORDINATE_DECIMALS,
    HOME_LAT_PRECISION,
    HOME_LON_PRECISION,
    LAT_MAX,
    LAT_MIN,
    LON_MAX,
    LON_MIN,
    NAME_MAX_LENGTH,
    TIMEZONE_MAX_LENGTH,
)
from app.core.database import Base

if TYPE_CHECKING:  # imported only for type hints, avoiding circular imports
    from app.models.family_member import FamilyMember


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(f"home_lat BETWEEN {LAT_MIN} AND {LAT_MAX}", name="home_lat_range"),
        CheckConstraint(f"home_lon BETWEEN {LON_MIN} AND {LON_MAX}", name="home_lon_range"),
        # Either both coordinates are set, or neither is.
        CheckConstraint("(home_lat IS NULL) = (home_lon IS NULL)", name="home_coordinates_together"),
        # With this, the case-sensitive UNIQUE(email) is effectively case-insensitive,
        # even for writes that bypass the Pydantic schemas.
        CheckConstraint("email = lower(email)", name="email_lowercase"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH))
    # Lowercased by the schemas and enforced by the email_lowercase CHECK.
    email: Mapped[str] = mapped_column(String(EMAIL_MAX_LENGTH), unique=True)
    # Internal only: never part of any read schema. Required, so an account can
    # never exist without a credential. Hashing arrives in the auth milestone.
    password_hash: Mapped[str] = mapped_column(String(255))
    # Exact decimals rounded to 2 places (~1.1 km): the column itself enforces the
    # precision, so even writes that bypass the schemas cannot store an exact home.
    home_lat: Mapped[Decimal | None] = mapped_column(Numeric(HOME_LAT_PRECISION, HOME_COORDINATE_DECIMALS))
    home_lon: Mapped[Decimal | None] = mapped_column(Numeric(HOME_LON_PRECISION, HOME_COORDINATE_DECIMALS))
    # IANA time zone name, validated by the schemas with zoneinfo (PostgreSQL
    # cannot check IANA names in a CHECK constraint). Routine times use it.
    timezone: Mapped[str] = mapped_column(
        String(TIMEZONE_MAX_LENGTH),
        default=DEFAULT_TIMEZONE,
        server_default=text(f"'{DEFAULT_TIMEZONE}'"),
    )
    # Set by the server when the user gives consent; never accepted from clients.
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # onupdate works for ORM updates only; a DB trigger can cover raw SQL later.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    family_members: Mapped[list["FamilyMember"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,  # let PostgreSQL's ON DELETE CASCADE do the work
    )

    def __repr__(self) -> str:  # id only: no email, coordinates or hash
        return f"User(id={self.id!s})"
