"""GET /health/db against the real Supabase database."""

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.database import get_engine
from main import app

pytestmark = pytest.mark.integration


@pytest.fixture
def client(db_engine):  # db_engine: skips if no database is configured/reachable
    get_settings.cache_clear()
    get_engine.cache_clear()
    yield TestClient(app)
    get_engine().dispose()
    get_engine.cache_clear()


def test_health_db_returns_ok_with_latency_only(client):
    response = client.get("/health/db")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"status", "latency_ms"}
    assert body["status"] == "ok"
    assert 0 <= body["latency_ms"] < 10_000
    for leak in ("supabase", "postgres", "5432", "@"):
        assert leak not in response.text
