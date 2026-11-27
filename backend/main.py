"""EcoHealth API entry point.

Run (from backend/):  .\\.venv\\Scripts\\python.exe -m uvicorn main:app --reload

Importing this module does not connect to the database or call any provider;
the shared environment service is created at startup (lifespan).
"""

import logging
from contextlib import AsyncExitStack, asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.health import router as health_router
from app.api.me import router as me_router
from app.api.members import router as members_router
from app.api.risk import router as risk_router
from app.core.config import ConfigurationError, get_settings
from app.core.errors import install_error_handling
from app.core.logging import configure_logging

configure_logging()
logger = logging.getLogger("app.main")
DEFAULT_CORS_ORIGINS = ["http://localhost:3000"]


def _cors_origins() -> list[str]:
    try:
        return get_settings().cors_origin_list
    except ConfigurationError:
        return DEFAULT_CORS_ORIGINS


@asynccontextmanager
async def lifespan(app: FastAPI):
    """One shared CachedEnvironmentService (one HTTP client) for the whole process."""
    from app.services.environment import CachedEnvironmentService

    async with AsyncExitStack() as stack:
        app.state.environment = None
        try:
            app.state.environment = await stack.enter_async_context(CachedEnvironmentService.create())
        except ConfigurationError:
            logger.warning("Environment service not started: configuration missing (risk endpoints return 503)")
        yield


app = FastAPI(title="EcoHealth API", lifespan=lifespan)
install_error_handling(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,  # the refresh-token cookie
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(me_router)
app.include_router(members_router)
app.include_router(risk_router)
