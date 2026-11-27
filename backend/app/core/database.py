"""Database connection foundation for EcoHealth (Supabase PostgreSQL).

- create_db_engine(): builds a SQLAlchemy engine with Supabase-friendly pool settings
- get_engine():       one cached engine per process, created on first use
- SessionLocal:       factory for database sessions (one session per request)
- Base:               parent class for future ORM models (no tables defined here)
- get_db():           FastAPI dependency that opens and always closes a session

Nothing in this module connects to the database at import time.
Tables are created by Alembic migrations (later), never by Base.metadata.create_all().
"""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings

# ---- Connection pool settings ----
# Conservative values: Supabase's Session Pooler gives every client connection
# its own server connection, and small plans allow only a few of them.
POOL_SIZE = 3  # connections kept open and reused
MAX_OVERFLOW = 2  # extra temporary connections under load (max 5 in total)
POOL_TIMEOUT = 30  # seconds to wait for a free connection before raising an error
POOL_RECYCLE = 1800  # replace connections older than 30 minutes
CONNECT_TIMEOUT = 10  # seconds; fail fast if Supabase is unreachable


def create_db_engine(database_url: str) -> Engine:
    """Create a SQLAlchemy engine. This does NOT open a connection yet."""
    return create_engine(
        database_url,
        pool_pre_ping=True,  # check a connection is alive before lending it out
        pool_size=POOL_SIZE,
        max_overflow=MAX_OVERFLOW,
        pool_timeout=POOL_TIMEOUT,
        pool_recycle=POOL_RECYCLE,
        hide_parameters=True,  # keep query values (user data) out of error messages
        connect_args={"connect_timeout": CONNECT_TIMEOUT},
    )


@lru_cache
def get_engine() -> Engine:
    """Return the application's single engine, building it on first use.

    This is the ONLY place that reads the raw database URL.
    """
    database_url = get_settings().database_url.get_secret_value()
    return create_db_engine(database_url)


# Not bound to an engine here, so importing this module never needs DATABASE_URL.
# The engine is supplied when a session is created (see get_db).
SessionLocal = sessionmaker(autoflush=False, expire_on_commit=False)


# Predictable constraint names make future Alembic migrations reliable.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Parent class for all EcoHealth ORM models."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one database session per request.

    Usage (in a future route):
        def read_profile(db: Session = Depends(get_db)): ...

    The session is always closed. Errors are rolled back and re-raised, never
    swallowed; turning them into safe API responses is the job of the app's
    exception handlers.
    """
    db = SessionLocal(bind=get_engine())
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
