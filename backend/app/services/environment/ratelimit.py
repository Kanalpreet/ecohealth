"""A small in-process sliding-window rate limiter."""

import time
from collections import deque
from collections.abc import Callable, Sequence

from app.services.environment.errors import ProviderUnavailableError


class SlidingWindowRateLimiter:
    """Allow at most N calls per window, for several windows at once.

    Example: [(60, 60), (2000, 3600)] = 60 per minute AND 2,000 per hour.
    A call that would exceed a limit is refused (not delayed), so a snapshot
    fails fast instead of hanging.
    """

    def __init__(
        self,
        provider: str,
        limits: Sequence[tuple[int, float]],
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.provider = provider
        self.limits = tuple(limits)
        self._clock = clock
        self._calls: deque[float] = deque()
        self._longest_window = max(window for _, window in self.limits)

    def acquire(self) -> None:
        now = self._clock()
        while self._calls and now - self._calls[0] >= self._longest_window:
            self._calls.popleft()
        for max_calls, window in self.limits:
            recent = sum(1 for t in self._calls if now - t < window)
            if recent >= max_calls:
                raise ProviderUnavailableError(
                    self.provider, f"local rate limit reached ({max_calls} per {int(window)} s)"
                )
        self._calls.append(now)
