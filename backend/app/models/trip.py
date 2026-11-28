"""Trips (Travel Mode): a user's trip, its stops and its travellers. See docs/travel.md.

Deletion cascades in PostgreSQL: user -> trips -> trip_stops / trip_members, and
family_members -> trip_members. The User and FamilyMember models are deliberately not
changed (no back-relationships); the database handles those cascades.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import (
    HOME_COORDINATE_DECIMALS,
    HOME_LAT_PRECISION,
    HOME_LON_PRECISION,
    LAT_MAX,
    LAT_MIN,
    LON_MAX,
    LON_MIN,
    NAME_MAX_LENGTH,
    PLACE_MAX_LENGTH,
    TRIP_TYPE_MAX_LENGTH,
    TRIP_TYPES,
)
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.family_member import FamilyMember

_TRIP_TYPES_SQL = ", ".join(f"'{t}'" for t in TRIP_TYPES)

# Association table: which family members travel on which trip.
trip_members = Table(
    "trip_members",
    Base.metadata,
    Column("trip_id", ForeignKey("trips.id", ondelete="CASCADE"), primary_key=True),
    Column("member_id", ForeignKey("family_members.id", ondelete="CASCADE"), primary_key=True, index=True),
)


class Trip(Base):
    __tablename__ = "trips"
    __table_args__ = (
        CheckConstraint(f"trip_type IN ({_TRIP_TYPES_SQL})", name="trip_type_valid"),
        CheckConstraint("end_date >= start_date", name="dates_in_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH))
    trip_type: Mapped[str] = mapped_column(String(TRIP_TYPE_MAX_LENGTH))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    stops: Mapped[list["TripStop"]] = relationship(
        back_populates="trip",
        order_by="TripStop.position",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    members: Mapped[list["FamilyMember"]] = relationship(secondary=trip_members, passive_deletes=True)

    def __repr__(self) -> str:
        return f"Trip(id={self.id!s})"


class TripStop(Base):
    __tablename__ = "trip_stops"
    __table_args__ = (
        UniqueConstraint("trip_id", "position", name="uq_trip_stops_trip_id_position"),
        CheckConstraint("position >= 1", name="position_positive"),
        CheckConstraint(f"lat BETWEEN {LAT_MIN} AND {LAT_MAX}", name="lat_range"),
        CheckConstraint(f"lon BETWEEN {LON_MIN} AND {LON_MAX}", name="lon_range"),
        CheckConstraint("leave_date >= arrive_date", name="dates_in_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    # Indexed by the UNIQUE (trip_id, position) constraint (trip_id is its first column).
    trip_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer)  # 1, 2, 3 ... in travel order
    place: Mapped[str] = mapped_column(String(PLACE_MAX_LENGTH))
    lat: Mapped[Decimal] = mapped_column(Numeric(HOME_LAT_PRECISION, HOME_COORDINATE_DECIMALS))
    lon: Mapped[Decimal] = mapped_column(Numeric(HOME_LON_PRECISION, HOME_COORDINATE_DECIMALS))
    elevation_m: Mapped[float | None] = mapped_column(Float)
    arrive_date: Mapped[date] = mapped_column(Date)
    leave_date: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    trip: Mapped[Trip] = relationship(back_populates="stops")

    def __repr__(self) -> str:
        return f"TripStop(id={self.id!s}, position={self.position})"
