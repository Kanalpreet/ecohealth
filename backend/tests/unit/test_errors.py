"""Unit tests for request ids and the global exception handler."""

import logging

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.core.errors import REQUEST_ID_HEADER, install_error_handling

pytestmark = pytest.mark.unit

SECRET_DETAIL = "password=hunter2 host=db.internal"


def make_app() -> FastAPI:
    app = FastAPI()
    install_error_handling(app)

    @app.get("/boom")
    def boom():
        raise RuntimeError(SECRET_DETAIL)

    @app.get("/ok")
    def ok():
        return {"ok": True}

    @app.get("/missing")
    def missing():
        raise HTTPException(status_code=404, detail="Not here")

    return app


@pytest.fixture
def client():
    # raise_server_exceptions=False: behave like a real server, return the 500 response.
    return TestClient(make_app(), raise_server_exceptions=False)


def test_unexpected_error_returns_generic_json_with_request_id(client):
    response = client.get("/boom")

    assert response.status_code == 500
    body = response.json()
    assert set(body) == {"error", "message", "request_id"}
    assert body["error"] == "internal_server_error"
    assert body["request_id"] == response.headers[REQUEST_ID_HEADER]
    assert len(body["request_id"]) == 32


def test_error_details_are_logged_not_returned(client, caplog):
    with caplog.at_level(logging.ERROR, logger="app.errors"):
        response = client.get("/boom?email=private@example.com")

    assert "hunter2" not in response.text and "RuntimeError" not in response.text
    request_id = response.json()["request_id"]
    record = next(r for r in caplog.records if r.name == "app.errors")
    assert request_id in record.getMessage()
    assert "RuntimeError" in record.getMessage()
    assert record.exc_info is not None  # traceback is in the server log
    assert "private@example.com" not in record.getMessage()  # query string not logged


def test_successful_responses_carry_a_request_id(client):
    response = client.get("/ok")
    assert response.status_code == 200
    assert len(response.headers[REQUEST_ID_HEADER]) == 32


def test_safe_incoming_request_id_is_reused(client):
    response = client.get("/boom", headers={REQUEST_ID_HEADER: "trace-1234abcd"})
    assert response.headers[REQUEST_ID_HEADER] == "trace-1234abcd"
    assert response.json()["request_id"] == "trace-1234abcd"


@pytest.mark.parametrize("bad", ["short", "x" * 65, "evil\nINJECTED log line", "<script>alert(1)</script>"])
def test_unsafe_incoming_request_id_is_replaced(client, bad):
    response = client.get("/ok", headers={REQUEST_ID_HEADER: bad.replace("\n", " ")})
    assert response.headers[REQUEST_ID_HEADER] != bad.replace("\n", " ")
    assert len(response.headers[REQUEST_ID_HEADER]) == 32


def test_http_exceptions_keep_their_normal_response(client):
    response = client.get("/missing")
    assert response.status_code == 404
    assert response.json() == {"detail": "Not here"}
    assert REQUEST_ID_HEADER in response.headers


def test_main_app_has_error_handling_installed():
    from main import app

    assert Exception in app.exception_handlers
