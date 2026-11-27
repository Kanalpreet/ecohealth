"""Unit tests for GET /health/db with the database replaced by fakes (no network)."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

import app.api.health as health
from app.core.config import ConfigurationError
from main import app

pytestmark = pytest.mark.unit

SECRET_LOOKING = "db.example-host.internal user=postgres.secretref password=hunter2"


class _FakeResult:
    def scalar_one(self):
        return 1


class _FakeConnection:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, statement):
        assert str(statement) == "SELECT 1"
        return _FakeResult()


class _FakeEngine:
    def connect(self):
        return _FakeConnection()


class _FailingEngine:
    def __init__(self, exc):
        self.exc = exc

    def connect(self):
        raise self.exc


@pytest.fixture
def client():
    return TestClient(app)


def test_health_db_ok_returns_status_and_latency_only(client, monkeypatch):
    monkeypatch.setattr(health, "get_engine", lambda: _FakeEngine())

    response = client.get("/health/db")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"status", "latency_ms"}
    assert body["status"] == "ok"
    assert isinstance(body["latency_ms"], float) and body["latency_ms"] >= 0


@pytest.mark.parametrize(
    "exc",
    [
        OperationalError("SELECT 1", {}, Exception(SECRET_LOOKING)),
        ConfigurationError(SECRET_LOOKING),
        RuntimeError(SECRET_LOOKING),
    ],
)
def test_health_db_failure_is_503_without_details(client, monkeypatch, caplog, exc):
    monkeypatch.setattr(health, "get_engine", lambda: _FailingEngine(exc))

    response = client.get("/health/db")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable", "latency_ms": None}
    assert "hunter2" not in response.text and "secretref" not in response.text
    assert "hunter2" not in caplog.text and "secretref" not in caplog.text  # logs too


def test_importing_app_does_not_need_database_url():
    # main.py imported at module load above without touching settings or the DB.
    assert "/health/db" in app.openapi()["paths"]
