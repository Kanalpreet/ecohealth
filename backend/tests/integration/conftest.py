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
REQUIRED_TABLES = ("users", "family_members", "routines", "env_cache")
# Cache tests only use cells near the South Pole, so they can never collide with
# real cached cells, and leftovers are easy to detect.
TEST_CACHE_MAX_LAT = -89.0


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
        cache_leftovers = connection.execute(
            text("SELECT count(*) FROM public.env_cache WHERE cell_lat <= :lat"), {"lat": TEST_CACHE_MAX_LAT}
        ).scalar_one()
    engine.dispose()
    assert leftovers == 0, f"{leftovers} integration-test users were left in the database"
    assert cache_leftovers == 0, f"{cache_leftovers} integration-test cache rows were left in the database"


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


# ---------------------------------------------------------------------------
# API test client (Go 5): real app + real Supabase session (rolled back),
# fresh login rate limiter, recorded environment snapshot (no live provider calls).
# ---------------------------------------------------------------------------

STRONG_PASSWORD = "correct-horse-battery-staple"


class FakeEnvironment:
    """Stands in for CachedEnvironmentService: returns a recorded snapshot."""

    def __init__(self, snapshot) -> None:
        self.snapshot = snapshot
        self.calls: list[tuple[float, float]] = []

    async def get_snapshot(self, latitude: float, longitude: float):
        self.calls.append((latitude, longitude))
        return self.snapshot


def recorded_snapshot(name: str = "delhi_recorded"):
    from pathlib import Path

    from app.services.environment.models import EnvironmentSnapshot

    path = Path(__file__).resolve().parents[1] / "fixtures" / "risk" / f"{name}.json"
    return EnvironmentSnapshot.model_validate_json(path.read_text(encoding="utf-8"))


@pytest.fixture
def environment():
    return FakeEnvironment(recorded_snapshot())


@pytest.fixture
def limiter():
    from app.core.ratelimit import LoginRateLimiter

    return LoginRateLimiter(max_failures_per_email=5, max_attempts_per_ip=20, window_seconds=900)


@pytest.fixture
def client(db_session, environment, limiter):
    from fastapi.testclient import TestClient

    from app.api.deps import get_login_limiter, settings_dep
    from app.api.risk import get_environment
    from app.core.database import get_db
    from main import app

    # TestClient calls FastAPI directly (/auth/...), not through the frontend's /api proxy,
    # so the refresh cookie must use Path=/auth for its cookie jar to send it back.
    test_settings = get_settings().model_copy(update={"refresh_cookie_path": "/auth"})
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[settings_dep] = lambda: test_settings
    app.dependency_overrides[get_login_limiter] = lambda: limiter
    app.dependency_overrides[get_environment] = lambda: environment
    try:
        yield TestClient(app)  # no `with`: the real lifespan (live environment service) is not started
    finally:
        app.dependency_overrides.clear()


def register(client, email: str | None = None, password: str = STRONG_PASSWORD, **extra):
    body = {"name": "Test User", "email": email or unique_email(), "password": password, "consent": True, **extra}
    return client.post("/auth/register", json=body)


def login(client, email: str, password: str = STRONG_PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


def new_user(client) -> tuple[str, dict]:
    """Register + login; returns (email, Authorization header)."""
    email = unique_email()
    assert register(client, email).status_code == 201
    response = login(client, email)
    assert response.status_code == 200
    return email, {"Authorization": f"Bearer {response.json()['access_token']}"}
