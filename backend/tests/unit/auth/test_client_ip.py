"""Trusted-proxy client IP resolution, cookie path and proxy settings (no database)."""

import pytest
from fastapi import Response
from pydantic import ValidationError
from starlette.requests import Request

from app.api.auth import clear_refresh_cookie, set_refresh_cookie
from app.api.deps import client_ip
from app.core.client_ip import resolve_client_ip
from app.core.config import Settings, parse_trusted_proxies

pytestmark = pytest.mark.unit

DB = "postgresql+psycopg://u:p@localhost:5432/db"
LOCAL = parse_trusted_proxies("localhost")


def settings(**kwargs) -> Settings:
    return Settings(_env_file=None, database_url=DB, **kwargs)


# ---- resolve_client_ip ----


def test_direct_client_ignores_forwarded_for():
    assert resolve_client_ip("198.51.100.7", ["203.0.113.5"], LOCAL) == "198.51.100.7"


def test_trusted_proxy_uses_the_rightmost_untrusted_address():
    assert resolve_client_ip("127.0.0.1", ["203.0.113.5"], LOCAL) == "203.0.113.5"
    # The left entry was written by the client and is ignored.
    assert resolve_client_ip("127.0.0.1", ["198.51.100.1, 203.0.113.5"], LOCAL) == "203.0.113.5"
    # Several header lines are read as one list.
    assert resolve_client_ip("::1", ["198.51.100.1", "203.0.113.5"], LOCAL) == "203.0.113.5"


def test_chain_of_trusted_proxies_is_walked():
    trusted = parse_trusted_proxies("localhost, 10.0.0.0/8")
    assert resolve_client_ip("127.0.0.1", ["203.0.113.5, 10.1.2.3"], trusted) == "203.0.113.5"


def test_trusted_proxy_without_header_or_only_trusted_hops_falls_back_to_the_last_trusted():
    assert resolve_client_ip("127.0.0.1", [], LOCAL) == "127.0.0.1"
    assert resolve_client_ip("127.0.0.1", ["::1"], LOCAL) == "::1"


def test_garbage_in_forwarded_for_stops_the_walk():
    assert resolve_client_ip("127.0.0.1", ["not-an-ip"], LOCAL) == "127.0.0.1"
    assert resolve_client_ip("127.0.0.1", ["203.0.113.5, junk"], LOCAL) == "127.0.0.1"


def test_ipv4_mapped_ipv6_is_normalised():
    # Node (the Vite proxy) often reports IPv4 peers like this.
    assert resolve_client_ip("::ffff:127.0.0.1", ["::ffff:203.0.113.5"], LOCAL) == "203.0.113.5"


def test_no_trusted_proxies_means_never_trust_the_header():
    assert resolve_client_ip("127.0.0.1", ["203.0.113.5"], parse_trusted_proxies("")) == "127.0.0.1"


def test_missing_or_non_ip_peer():
    assert resolve_client_ip(None, ["203.0.113.5"], LOCAL) == "unknown"
    assert resolve_client_ip("testclient", ["203.0.113.5"], LOCAL) == "testclient"


def test_client_ip_reads_the_request():
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/auth/login",
        "headers": [(b"x-forwarded-for", b"203.0.113.9")],
        "client": ("127.0.0.1", 50000),
    }
    assert client_ip(Request(scope), settings()) == "203.0.113.9"
    assert client_ip(Request(scope), settings(trusted_proxies="10.0.0.1")) == "127.0.0.1"
    assert client_ip(Request({**scope, "client": None}), settings()) == "unknown"


# ---- settings ----


def test_proxy_settings_defaults():
    s = settings()
    assert s.refresh_cookie_path == "/api/auth"
    assert [str(n) for n in s.trusted_proxy_networks] == ["127.0.0.1/32", "::1/128"]


def test_trusted_proxies_parsing_and_validation():
    s = settings(trusted_proxies=" 10.0.0.0/8 , 192.0.2.4,localhost ")
    assert [str(n) for n in s.trusted_proxy_networks] == ["10.0.0.0/8", "192.0.2.4/32", "127.0.0.1/32", "::1/128"]
    with pytest.raises(ValidationError):
        settings(trusted_proxies="10.0.0.0/8, not-an-ip")


@pytest.mark.parametrize("path", ["api/auth", "/api auth", "/api;x=1", "/a,b", ""])
def test_invalid_cookie_paths_are_rejected(path):
    with pytest.raises(ValidationError):
        settings(refresh_cookie_path=path)


def test_cookie_path_trailing_slash_is_removed():
    assert settings(refresh_cookie_path="/auth/").refresh_cookie_path == "/auth"


# ---- the cookie uses the configured path ----


def _set_cookie(response: Response) -> str:
    return response.headers["set-cookie"].lower()


@pytest.mark.parametrize("path", ["/api/auth", "/auth"])
def test_refresh_cookie_is_set_and_cleared_on_the_configured_path(path):
    s = settings(refresh_cookie_path=path)
    response = Response()
    set_refresh_cookie(response, "token-value", s)
    header = _set_cookie(response)
    assert f"path={path};" in header and "httponly" in header and "samesite=lax" in header

    cleared = Response()
    clear_refresh_cookie(cleared, s)
    assert f"path={path};" in _set_cookie(cleared) and "max-age=0" in _set_cookie(cleared)
