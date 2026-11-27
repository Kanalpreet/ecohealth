"""Shared fixtures for database integration tests.

Every test gets a Session bound to a connection whose outer transaction is
ALWAYS rolled back, so nothing is left behind in Supabase. Test data is
synthetic and uses the reserved example.com domain with an "it-" prefix.

- DATABASE_URL missing/invalid or host unreachable -> SKIP (reason shown)
- Tables missing (migrations not applied)            -> FAIL (run alembic upgrade head)
"""

import socket
import uuid

import pytest
from sqlalchemy import inspect, make_url, text
from sqlalchemy.orm import Session

from app.core.config import ConfigurationError, get_settings
from app.core.database import create_db_engine

TEST_EMAIL_PREFIX = "it-"
REQUIRED_TABLES = ("users", "family_members", "routines")


def unique_email() -> str:
    return f"{TEST_EMAIL_PREFIX}{uuid.uuid4().hex}@example.com"


@pytest.fixture(scope="session")
def db_engine():
    get_settings.cache_clear()
    try:
        url = get_settings().database_url.get_secret_value()
    except ConfigurationError as exc:
        problems = " ".join(line.strip() for line in str(exc).splitlines()[1:-1])
        pytest.skip(f"Database not configured: {problems}")

    parsed = make_url(url)
    port = parsed.port or 5432
    try:
        socket.create_connection((parsed.host, port), timeout=5).close()
    except OSError as exc:
        pytest.skip(f"Database host unreachable on port {port} ({type(exc).__name__})")

    engine = create_db_engine(url)
    with engine.connect() as connection:
        missing = [t for t in REQUIRED_TABLES if not inspect(connection).has_table(t, schema="public")]
    if missing:
        engine.dispose()
        pytest.fail(f"Tables missing: {missing}. Run: alembic upgrade head", pytrace=False)

    yield engine

    # Prove the rollback strategy worked: no synthetic test users remain.
    with engine.connect() as connection:
        leftovers = connection.execute(
            text("SELECT count(*) FROM public.users WHERE email LIKE :pattern"),
            {"pattern": f"{TEST_EMAIL_PREFIX}%@example.com"},
        ).scalar_one()
    engine.dispose()
    assert leftovers == 0, f"{leftovers} integration-test users were left in the database"


@pytest.fixture
def db_session(db_engine):
    """A Session inside a transaction that is rolled back after the test.

    join_transaction_mode="create_savepoint": session.commit()/rollback() inside
    a test only affect a SAVEPOINT; the outer transaction is still rolled back.
    """
    connection = db_engine.connect()
    outer = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint", autoflush=False)
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        connection.close()
