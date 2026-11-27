"""Repository for the env_cache table (see docs/caching.md).

Every function takes a Session and never commits; the caller decides the
transaction boundary.
"""

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.env_cache import EnvCache

UNIQUE_CONSTRAINT = "uq_env_cache_provider_cell"


def get_entry(session: Session, provider: str, cell_lat: Decimal, cell_lon: Decimal) -> EnvCache | None:
    """The cached row for (provider, cell), fresh or expired; None if absent."""
    stmt = select(EnvCache).where(
        EnvCache.provider == provider, EnvCache.cell_lat == cell_lat, EnvCache.cell_lon == cell_lon
    )
    return session.execute(stmt).scalar_one_or_none()


def upsert_entry(
    session: Session,
    provider: str,
    cell_lat: Decimal,
    cell_lon: Decimal,
    payload: dict[str, Any],
    fetched_at: datetime,
    expires_at: datetime,
) -> None:
    """Insert or replace the row for (provider, cell) atomically.

    INSERT ... ON CONFLICT DO UPDATE: concurrent writers for the same cell end
    up with exactly one row (the last write wins) instead of a duplicate-key error.
    """
    stmt = insert(EnvCache).values(
        provider=provider,
        cell_lat=cell_lat,
        cell_lon=cell_lon,
        payload=payload,
        fetched_at=fetched_at,
        expires_at=expires_at,
    )
    stmt = stmt.on_conflict_do_update(
        constraint=UNIQUE_CONSTRAINT,
        set_={
            "payload": stmt.excluded.payload,
            "fetched_at": stmt.excluded.fetched_at,
            "expires_at": stmt.excluded.expires_at,
        },
    )
    session.execute(stmt)


def count_expired(session: Session, now: datetime) -> int:
    """Number of rows whose TTL has passed (uses the expires_at index)."""
    return session.execute(select(func.count()).select_from(EnvCache).where(EnvCache.expires_at <= now)).scalar_one()


def delete_unusable(session: Session, now: datetime, max_stale: timedelta) -> int:
    """Delete rows that can no longer be served: expired AND older than the max stale age.

    Rows are not deleted by age alone: elevation entries stay fresh for 30 days.
    Returns the number of deleted rows.
    """
    result = session.execute(
        delete(EnvCache).where(EnvCache.expires_at <= now, EnvCache.fetched_at < now - max_stale)
    )
    return result.rowcount or 0
