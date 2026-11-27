"""Cache of environmental provider results, one row per provider per grid cell.

Contains only grid-cell centres and public environmental data (no user ids,
exact coordinates or health data). See docs/caching.md.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

CACHE_PROVIDERS = ("weather", "air_quality", "elevation", "openaq")
_PROVIDER_LIST_SQL = ", ".join(f"'{p}'" for p in CACHE_PROVIDERS)


class EnvCache(Base):
    __tablename__ = "env_cache"
    __table_args__ = (
        UniqueConstraint("provider", "cell_lat", "cell_lon", name="uq_env_cache_provider_cell"),
        CheckConstraint(f"provider IN ({_PROVIDER_LIST_SQL})", name="provider_valid"),
        CheckConstraint("cell_lat BETWEEN -90 AND 90", name="cell_lat_range"),
        CheckConstraint("cell_lon BETWEEN -180 AND 180", name="cell_lon_range"),
        CheckConstraint("expires_at > fetched_at", name="expires_after_fetch"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    provider: Mapped[str] = mapped_column(String(32))
    cell_lat: Mapped[Decimal] = mapped_column(Numeric(7, 4))
    cell_lon: Mapped[Decimal] = mapped_column(Numeric(8, 4))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    def __repr__(self) -> str:
        return f"EnvCache(provider={self.provider!r}, cell=({self.cell_lat}, {self.cell_lon}))"
