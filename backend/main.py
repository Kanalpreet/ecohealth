"""EcoHealth API entry point.

Run (from backend/):  .\\.venv\\Scripts\\python.exe -m uvicorn main:app --reload

Importing this module does not read settings or connect to the database;
that happens lazily on the first request that needs it.
"""

from fastapi import FastAPI

from app.api.health import router as health_router
from app.core.errors import install_error_handling

app = FastAPI(title="EcoHealth API")
install_error_handling(app)
app.include_router(health_router)
