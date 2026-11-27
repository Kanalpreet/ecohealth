"""Integration tests against the real Supabase database (read-only: SELECT 1).

Behaviour:
- DATABASE_URL missing/invalid      -> SKIP (reason shown)
- Database host unreachable         -> SKIP (network problem, reason shown)
- Host reachable but query fails    -> FAIL (real problem, e.g. wrong password)

Credentials are never printed: failures report only the error type and SQLSTATE.
"""

import socket

import pytest
from sqlalchemy import make_url, text
from sqlalchemy.exc import DBAPIError

from app.core import database
from app.core.config import ConfigurationError, get_settings

pytestmark = pytest.mark.integration

NETWORK_CHECK_TIMEOUT = 5  # seconds

# Known Supabase pooler / PostgreSQL error markers -> safe, actionable categories.
# The raw message is only matched against, never printed.
ERROR_CATEGORIES = (
    ("password authentication failed", "wrong database password"),
    ("tenant or user not found", "project ref or pooler host does not match a Supabase project"),
    ("einvaliduserinfo", "username must be postgres.<project-ref>"),
    ("ecircuitbreaker", "pooler temporarily blocked after repeated failed logins; wait and retry"),
    ("max client connections", "pooler connection limit reached"),
    ("timeout", "connection timed out"),
)


def _describe_db_error(exc: DBAPIError) -> str:
    original = exc.orig
    sqlstate = getattr(original, "sqlstate", None) or "unknown"
    message = str(original).lower()
    category = next((label for marker, label in ERROR_CATEGORIES if marker in message), "unclassified")
    return f"{type(original).__name__} (SQLSTATE {sqlstate}, category: {category})"


@pytest.fixture(scope="module")
def engine():
    get_settings.cache_clear()
    database.get_engine.cache_clear()

    try:
        settings = get_settings()
    except ConfigurationError as exc:
        problems = " ".join(line.strip() for line in str(exc).splitlines()[1:-1])
        pytest.skip(f"Database not configured: {problems}")

    url = make_url(settings.database_url.get_secret_value())
    port = url.port or 5432
    try:
        socket.create_connection((url.host, port), timeout=NETWORK_CHECK_TIMEOUT).close()
    except OSError as exc:
        pytest.skip(
            f"Database host unreachable on port {port} ({type(exc).__name__}); "
            "check your internet connection."
        )

    engine = database.get_engine()
    yield engine
    engine.dispose()  # close pooled connections after the tests
    database.get_engine.cache_clear()
    get_settings.cache_clear()


# pytest.fail() is called OUTSIDE the except block on purpose: calling it inside
# would chain the original driver exception, and pytest would print its raw
# message (server address, username) despite pytrace=False.


def test_select_one_via_engine(engine):
    error = None
    try:
        with engine.connect() as connection:
            value = connection.execute(text("SELECT 1")).scalar_one()
    except DBAPIError as exc:
        error = _describe_db_error(exc)

    if error:
        pytest.fail(
            f"Database reachable but query failed: {error}. "
            "Check the credentials in backend/.env.",
            pytrace=False,
        )
    assert value == 1


def test_select_one_via_get_db_dependency(engine):
    error = None
    dependency = database.get_db()
    db = next(dependency)
    try:
        value = db.execute(text("SELECT 1")).scalar_one()
    except DBAPIError as exc:
        error = _describe_db_error(exc)
    finally:
        dependency.close()  # runs get_db's cleanup, like FastAPI does

    if error:
        pytest.fail(f"Query through get_db() failed: {error}.", pytrace=False)
    assert value == 1
