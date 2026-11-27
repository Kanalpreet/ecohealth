"""In-process login rate limiting (sliding windows).

Limitation: counters live in ONE process's memory: they reset on restart and are
not shared between workers/servers. A shared store is needed before production.
See docs/auth.md.
"""

import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable


class AttemptLimiter:
    """At most `max_attempts` recorded attempts per key within `window_seconds`."""

    def __init__(self, max_attempts: int, window_seconds: float, clock: Callable[[], float] = time.monotonic) -> None:
        self.max_attempts = max_attempts
        self.window = window_seconds
        self._clock = clock
        self._attempts: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()  # sync endpoints run in a thread pool

    def _prune(self, key: str, now: float) -> deque[float]:
        attempts = self._attempts[key]
        while attempts and now - attempts[0] >= self.window:
            attempts.popleft()
        return attempts

    def retry_after(self, key: str) -> int | None:
        """Seconds until another attempt is allowed, or None if allowed now."""
        with self._lock:
            now = self._clock()
            attempts = self._prune(key, now)
            if len(attempts) < self.max_attempts:
                return None
            return max(1, int(self.window - (now - attempts[0])) + 1)

    def record(self, key: str) -> None:
        with self._lock:
            now = self._clock()
            self._prune(key, now).append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._attempts.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._attempts.clear()


class LoginRateLimiter:
    """Failed logins per email + all login attempts per client IP."""

    def __init__(self, max_failures_per_email: int, max_attempts_per_ip: int, window_seconds: float,
                 clock: Callable[[], float] = time.monotonic) -> None:
        self.by_email = AttemptLimiter(max_failures_per_email, window_seconds, clock)
        self.by_ip = AttemptLimiter(max_attempts_per_ip, window_seconds, clock)

    def retry_after(self, email: str, ip: str) -> int | None:
        waits = [w for w in (self.by_email.retry_after(email), self.by_ip.retry_after(ip)) if w is not None]
        return max(waits) if waits else None

    def clear(self) -> None:
        self.by_email.clear()
        self.by_ip.clear()
