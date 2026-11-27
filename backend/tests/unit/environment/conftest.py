"""Helpers for environment-client unit tests: saved fixtures + httpx.MockTransport.

No test in this package touches the network or really sleeps.
"""

import asyncio
import copy
import json
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest

from app.services.environment.http import ProviderHttpClient

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "environment"
# "Now" for every test: matches the times in the saved fixtures.
NOW = datetime(2026, 11, 27, 8, 20, tzinfo=UTC)
FAKE_KEY = "test-openaq-key-not-real"

Handler = Callable[[httpx.Request], httpx.Response]


def load(name: str) -> dict:
    return copy.deepcopy(json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8")))


def run(coro):
    return asyncio.run(coro)


class Recorder:
    """A MockTransport handler that routes by URL path and records every request."""

    def __init__(self, routes: dict[str, Handler | dict | list]) -> None:
        self.routes = routes
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        for path, target in self.routes.items():
            if request.url.path == path:
                if callable(target):
                    return target(request)
                return httpx.Response(200, json=target)
        return httpx.Response(404, json={"detail": "no mock route"})

    def calls(self, path: str) -> list[httpx.Request]:
        return [r for r in self.requests if r.url.path == path]


class FakeSleep:
    def __init__(self) -> None:
        self.delays: list[float] = []

    async def __call__(self, seconds: float) -> None:
        self.delays.append(seconds)


def sequence(*responses: httpx.Response | Exception) -> Handler:
    """Return the given responses (or raise the given exceptions) in order."""
    items = list(responses)

    def handler(request: httpx.Request) -> httpx.Response:
        item = items.pop(0) if len(items) > 1 else items[0]
        if isinstance(item, Exception):
            raise item
        return item

    return handler


@pytest.fixture
def fake_sleep() -> FakeSleep:
    return FakeSleep()


@pytest.fixture
def make_http(fake_sleep):
    """Build a ProviderHttpClient over a MockTransport; returns (http, client) pairs to close."""
    clients: list[httpx.AsyncClient] = []

    def factory(provider: str, handler: Handler, **kwargs) -> ProviderHttpClient:
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        clients.append(client)
        return ProviderHttpClient(provider, client, sleep=fake_sleep, **kwargs)

    yield factory
    for client in clients:
        run(client.aclose())
