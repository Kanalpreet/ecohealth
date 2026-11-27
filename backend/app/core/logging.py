"""Logging setup for the API and scripts.

The httpx/httpcore loggers are kept at WARNING: at INFO they log full request
URLs, and our provider URLs contain coordinates (sensitive location data).
"""

import logging

QUIET_LOGGERS = ("httpx", "httpcore")


def configure_logging(level: int = logging.INFO) -> None:
    if not logging.getLogger().handlers:  # don't override a host's config (e.g. uvicorn/pytest)
        logging.basicConfig(level=level, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
    for name in QUIET_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)
