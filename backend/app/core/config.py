"""Application configuration for the EcoHealth backend.

Values are loaded (in priority order) from:
  1. Real OS environment variables
  2. backend/.env
  3. Defaults declared on the Settings class

Secrets such as DATABASE_URL are stored as SecretStr so they never appear
in print(), logs or validation error messages.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> parents[2] is backend/
BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = BACKEND_DIR / ".env"

REQUIRED_DB_SCHEME = "postgresql+psycopg://"


class ConfigurationError(RuntimeError):
    """Raised when settings are missing or invalid. Never contains secret values."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        case_sensitive=False,  # APP_ENV in .env maps to the app_env attribute
        extra="ignore",  # unknown keys in .env (for future milestones) are ignored
        hide_input_in_errors=True,  # never echo raw values (e.g. passwords) in errors
    )

    app_name: str = "EcoHealth API"
    app_env: Literal["development", "test", "production"] = "development"
    debug: bool = False
    database_url: SecretStr  # required: no default

    @field_validator("database_url")
    @classmethod
    def check_driver_scheme(cls, value: SecretStr) -> SecretStr:
        """Require the SQLAlchemy + Psycopg 3 URL scheme. Does NOT connect."""
        if not value.get_secret_value().startswith(REQUIRED_DB_SCHEME):
            raise ValueError(
                f"DATABASE_URL must start with '{REQUIRED_DB_SCHEME}' "
                "(Supabase shows 'postgresql://'; add '+psycopg')."
            )
        return value


def _describe_errors(error: ValidationError) -> str:
    """Build a readable summary using only field names and messages (no values)."""
    lines = []
    for item in error.errors(include_input=False, include_url=False):
        field = ".".join(str(part) for part in item["loc"]).upper() or "SETTINGS"
        lines.append(f"  - {field}: {item['msg']}")
    return "\n".join(lines)


@lru_cache
def get_settings() -> Settings:
    """Return the application settings, created once and then reused."""
    try:
        return Settings()
    except ValidationError as error:
        raise ConfigurationError(
            "Invalid or missing EcoHealth configuration:\n"
            f"{_describe_errors(error)}\n"
            "Copy backend/.env.example to backend/.env and fill in the values."
        ) from None  # 'from None' hides the original error, which may hold details
