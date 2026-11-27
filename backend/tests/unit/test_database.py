"""Unit tests for app.core.database.

No test here opens a real database connection: a fake URL is used and
SQLAlchemy only connects when a query actually runs.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.core import database
from app.core.config import Settings, get_settings

pytestmark = pytest.mark.unit

FAKE_PASSWORD = "fake-db-password-456"
FAKE_DB_URL = f"postgresql+psycopg://tester:{FAKE_PASSWORD}@localhost:5432/ecohealth_test"
BACKEND_DIR = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch):
    """Use the fake URL only; never read the real backend/.env."""
    monkeypatch.setitem(Settings.model_config, "env_file", None)
    monkeypatch.setenv("DATABASE_URL", FAKE_DB_URL)
    real_get_engine = database.get_engine  # some tests replace it with a fake
    get_settings.cache_clear()
    real_get_engine.cache_clear()
    yield
    real_get_engine.cache_clear()
    get_settings.cache_clear()


# ---- Engine configuration ----


def test_engine_uses_psycopg3_driver():
    engine = database.create_db_engine(FAKE_DB_URL)

    assert engine.dialect.name == "postgresql"
    assert engine.dialect.driver == "psycopg"


def test_engine_pool_settings_are_conservative():
    pool = database.create_db_engine(FAKE_DB_URL).pool

    assert pool._pre_ping is True
    assert pool.size() == database.POOL_SIZE == 3
    assert pool._max_overflow == database.MAX_OVERFLOW == 2
    assert pool._timeout == database.POOL_TIMEOUT
    assert pool._recycle == database.POOL_RECYCLE


def test_engine_hides_query_parameters():
    assert database.create_db_engine(FAKE_DB_URL).hide_parameters is True


def test_engine_never_exposes_password(capsys):
    engine = database.create_db_engine(FAKE_DB_URL)
    print(engine)
    print(repr(engine))
    print(engine.url)

    output = capsys.readouterr().out
    assert FAKE_PASSWORD not in output
    assert "***" in output


def test_get_engine_uses_settings_and_is_cached():
    engine = database.get_engine()

    assert engine is database.get_engine()
    assert engine.url.database == "ecohealth_test"


# ---- Session factory and Base ----


def test_session_factory_settings():
    assert database.SessionLocal.kw["autoflush"] is False
    assert database.SessionLocal.kw["expire_on_commit"] is False


def test_base_has_naming_convention_and_no_tables():
    assert database.Base.metadata.naming_convention["pk"] == "pk_%(table_name)s"
    assert database.Base.metadata.tables == {}


def test_importing_database_module_does_not_load_settings():
    """Importing the module must work on a machine with no DATABASE_URL."""
    env = {k: v for k, v in os.environ.items() if k.upper() != "DATABASE_URL"}
    code = (
        "import app.core.database; "
        "from app.core.config import get_settings; "
        "print(get_settings.cache_info().misses)"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )

    assert result.stdout.strip() == "0"  # settings were never read during import


# ---- get_db() dependency ----


class FakeSession:
    """Records what get_db() does with the session."""

    def __init__(self):
        self.rolled_back = False
        self.closed = False

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


@pytest.fixture
def fake_session(monkeypatch):
    session = FakeSession()
    monkeypatch.setattr(database, "SessionLocal", lambda bind: session)
    monkeypatch.setattr(database, "get_engine", lambda: "fake-engine")
    return session


def test_get_db_yields_session_and_closes_it(fake_session):
    dependency = database.get_db()

    assert next(dependency) is fake_session
    with pytest.raises(StopIteration):
        next(dependency)  # what FastAPI does after the response

    assert fake_session.closed is True
    assert fake_session.rolled_back is False


def test_get_db_rolls_back_closes_and_reraises_on_error(fake_session):
    dependency = database.get_db()
    next(dependency)

    # Simulate the route raising an error while using the session.
    with pytest.raises(ValueError, match="route failed"):
        dependency.throw(ValueError("route failed"))

    assert fake_session.rolled_back is True
    assert fake_session.closed is True


def test_get_db_returns_real_session_bound_to_engine():
    dependency = database.get_db()
    db = next(dependency)

    assert isinstance(db, Session)
    assert db.get_bind() is database.get_engine()
    dependency.close()
