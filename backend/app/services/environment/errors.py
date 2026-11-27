"""Exceptions raised by environmental data providers.

Messages are short, safe strings: never URLs (they contain coordinates),
API keys or raw response bodies.
"""


class ProviderError(Exception):
    """Base class: a provider could not deliver usable data."""

    kind = "error"

    def __init__(self, provider: str, reason: str) -> None:
        super().__init__(f"{provider}: {reason}")
        self.provider = provider
        self.reason = reason


class ProviderUnavailableError(ProviderError):
    """Network failure, timeout, HTTP error or rate limit (after any retries)."""

    kind = "unavailable"


class ProviderResponseError(ProviderError):
    """The provider answered, but the response broke its documented contract."""

    kind = "invalid_response"


class ProviderNotConfiguredError(ProviderError):
    """The provider needs configuration that is missing (e.g. an API key)."""

    kind = "not_configured"
