"""Alembic environment for EcoHealth.

- The database URL comes from app.core.config.get_settings() (backend/.env),
  never from alembic.ini. It is passed straight to create_engine and never put
  into Alembic's config (configparser would also mangle '%' in an encoded password).
- target_metadata is Base.metadata with every model imported (app.models).
- Autogenerate only sees OUR tables in the public schema, so Supabase-managed
  schemas (auth, storage, realtime, ...) and any other public tables are never
  altered or dropped.
- Use the Session Pooler (port 5432) or a direct connection, never the
  Transaction Pooler (port 6543): see docs/database.md.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, make_url, pool

import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.core.config import get_settings
from app.core.database import CONNECT_TIMEOUT, Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata
OUR_TABLES = frozenset(target_metadata.tables)
TRANSACTION_POOLER_PORT = 6543


def include_name(name: str | None, type_: str, parent_names: dict) -> bool:
    """Only reflect objects we own: tables not defined in our models are ignored."""
    if type_ == "schema":
        return name in (None, "public")
    if type_ == "table":
        return name in OUR_TABLES
    return True


def get_database_url() -> str:
    url = get_settings().database_url.get_secret_value()
    if make_url(url).port == TRANSACTION_POOLER_PORT:
        raise RuntimeError(
            "DATABASE_URL points to the Supabase Transaction Pooler (port 6543), which "
            "cannot run migrations safely. Use the Session Pooler (port 5432) or a direct connection."
        )
    return url


def configure_context(**kwargs) -> None:
    context.configure(
        target_metadata=target_metadata,
        compare_type=True,
        include_name=include_name,
        include_schemas=False,  # default schema (public) only
        **kwargs,
    )


def run_migrations_offline() -> None:
    """Emit SQL to stdout instead of connecting (alembic upgrade --sql)."""
    configure_context(url=get_database_url(), literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(
        get_database_url(),
        poolclass=pool.NullPool,  # one short-lived connection per command
        hide_parameters=True,
        connect_args={"connect_timeout": CONNECT_TIMEOUT},
    )
    try:
        with engine.connect() as connection:
            configure_context(connection=connection)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
