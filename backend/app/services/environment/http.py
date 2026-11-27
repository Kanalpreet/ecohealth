"""Shared HTTP layer: timeouts, retries with backoff, JSON decoding, safe errors."""

import asyncio
import logging
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any

import httpx

from app.services.environment.errors import ProviderResponseError, ProviderUnavailableError
from app.services.environment.ratelimit import SlidingWindowRateLimiter

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


@dataclass(frozen=True)
class RetryPolicy:
    attempts: int = 3  # 1 try + 2 retries
    base_delay: float = 0.5  # seconds; doubles each retry
    max_delay: float = 4.0

    def delay(self, attempt: int, retry_after: float | None = None) -> float:
        if retry_after is not None:
            return min(max(retry_after, 0.0), self.max_delay)
        return min(self.base_delay * 2 ** (attempt - 1), self.max_delay)


def _retry_after_seconds(response: httpx.Response) -> float | None:
    try:
        return float(response.headers["Retry-After"])
    except (KeyError, ValueError):
        return None


class ProviderHttpClient:
    """GET JSON from one provider with retries.

    Retries timeouts, HTTP 5xx and HTTP 429. Never logs URLs or query strings
    (they contain coordinates) nor headers (they may contain API keys).
    """

    def __init__(
        self,
        provider: str,
        client: httpx.AsyncClient,
        retry: RetryPolicy = RetryPolicy(),
        rate_limiter: SlidingWindowRateLimiter | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self.provider = provider
        self._client = client
        self._retry = retry
        self._rate_limiter = rate_limiter
        self._sleep = sleep

    async def get_json(
        self, url: str, params: Mapping[str, Any] | None = None, headers: Mapping[str, str] | None = None
    ) -> Any:
        path = httpx.URL(url).path  # safe to log: no host credentials, no query
        last_reason = "no attempt made"
        for attempt in range(1, self._retry.attempts + 1):
            if self._rate_limiter is not None:
                self._rate_limiter.acquire()
            retry_after = None
            try:
                response = await self._client.get(url, params=params, headers=headers)
            except httpx.TimeoutException:
                last_reason = "timeout"
            except httpx.TransportError as exc:
                raise ProviderUnavailableError(self.provider, f"connection failed ({type(exc).__name__})") from None
            else:
                status = response.status_code
                if status == 429 or status >= 500:
                    last_reason = f"HTTP {status}"
                    retry_after = _retry_after_seconds(response) if status == 429 else None
                elif status >= 400:
                    hint = " (check API key)" if status in (401, 403) else ""
                    raise ProviderUnavailableError(self.provider, f"HTTP {status}{hint}")
                else:
                    try:
                        return response.json()
                    except ValueError:
                        raise ProviderResponseError(self.provider, "response is not valid JSON") from None

            if attempt < self._retry.attempts:
                delay = self._retry.delay(attempt, retry_after)
                logger.info(
                    "%s %s: %s, retry %d/%d in %.1fs",
                    self.provider, path, last_reason, attempt, self._retry.attempts - 1, delay,
                )
                await self._sleep(delay)

        raise ProviderUnavailableError(self.provider, f"{last_reason} after {self._retry.attempts} attempts")
