"""Health-check endpoints."""

import logging
import time
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text

from app.core.database import get_engine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/health", tags=["health"])


class DatabaseHealth(BaseModel):
    """Status and latency only: never hostnames, users, URLs or driver errors."""

    status: Literal["ok", "unavailable"]
    latency_ms: float | None


@router.get("/db", response_model=DatabaseHealth, responses={503: {"model": DatabaseHealth}})
def database_health() -> DatabaseHealth | JSONResponse:
    """Run SELECT 1 against the database and report how long it took."""
    started = time.perf_counter()
    try:
        # Inside the try: a missing/invalid DATABASE_URL (ConfigurationError) is
        # reported as "unavailable" too, not as a 500 with details.
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1")).scalar_one()
    except Exception as exc:  # noqa: BLE001 - any failure means "unavailable"
        # Log the class name only; driver messages can contain host or user names.
        logger.warning("Database health check failed: %s", type(exc).__name__)
        body = DatabaseHealth(status="unavailable", latency_ms=None)
        return JSONResponse(status_code=503, content=body.model_dump())
    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    return DatabaseHealth(status="ok", latency_ms=latency_ms)
