"""Unit tests for app.core.config.

These tests never read the real backend/.env and never connect to a database.
They use a fake password so we can check that it never leaks.
"""

import pytest
from pydantic import ValidationError

from app.core import config
from app.core.config import ConfigurationError, Settings, get_settings

pytestmark = pytest.mark.unit

FAKE_PASSWORD = "fake-test-password-123"
FAKE_DB_URL = f"postgresql+psycopg://tester:{FAKE_PASSWORD}@localhost:5432/ecohealth_test"
SETTING_KEYS = ("APP_NAME", "APP_ENV", "DEBUG", "DATABASE_URL")


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch):
    """Give every test a clean environment that ignores the real backend/.env."""
    for key in SETTING_KEYS:
        monkeypatch.delenv(key, raising=False)
        monkeypatch.delenv(key.lower(), raising=False)
    # Make get_settings() (which calls Settings() with no args) skip the .env file.
    monkeypatch.setitem(Settings.model_config, "env_file", None)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_settings_load_from_environment(monkeypatch):
    monkeypatch.setenv("APP_NAME", "EcoHealth Test API")
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("DATABASE_URL", FAKE_DB_URL)

    settings = Settings()

    assert settings.app_name == "EcoHealth Test API"
    assert settings.debug is True  # the string "true" was converted to a bool
    assert settings.database_url.get_secret_value() == FAKE_DB_URL


def test_defaults_are_applied(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", FAKE_DB_URL)

    settings = Settings()

    assert settings.app_name == "EcoHealth API"
    assert settings.app_env == "development"
    assert settings.debug is False


def test_app_env_has_expected_value(monkeypatch):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DATABASE_URL", FAKE_DB_URL)

    assert Settings().app_env == "test"


def test_env_keys_are_case_insensitive(monkeypatch):
    monkeypatch.setenv("app_env", "production")
    monkeypatch.setenv("database_url", FAKE_DB_URL)

    assert Settings().app_env == "production"


def test_invalid_app_env_is_rejected(monkeypatch):
    monkeypatch.setenv("APP_ENV", "staging")
    monkeypatch.setenv("DATABASE_URL", FAKE_DB_URL)

    with pytest.raises(ValidationError) as exc_info:
        Settings()

    assert "app_env" in str(exc_info.value)


def test_missing_database_url_raises_validation_error():
    with pytest.raises(ValidationError) as exc_info:
        Settings()

    errors = exc_info.value.errors()
    assert errors[0]["loc"] == ("database_url",)
    assert errors[0]["type"] == "missing"


def test_get_settings_gives_clear_error_when_database_url_missing():
    with pytest.raises(ConfigurationError) as exc_info:
        get_settings()

    message = str(exc_info.value)
    assert "DATABASE_URL" in message
    assert "Field required" in message
    assert ".env.example" in message
    assert exc_info.value.__cause__ is None  # original error is not chained


def test_wrong_scheme_rejected_without_leaking_password(monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL", f"postgresql://tester:{FAKE_PASSWORD}@localhost:5432/db"
    )

    with pytest.raises(ValidationError) as exc_info:
        Settings()
    assert "postgresql+psycopg://" in str(exc_info.value)
    assert FAKE_PASSWORD not in str(exc_info.value)

    with pytest.raises(ConfigurationError) as config_exc:
        get_settings()
    assert FAKE_PASSWORD not in str(config_exc.value)


def test_secret_is_masked_in_all_representations(monkeypatch, capsys):
    monkeypatch.setenv("DATABASE_URL", FAKE_DB_URL)

    settings = Settings()
    print(settings)
    print(repr(settings))
    print(settings.model_dump())
    print(settings.model_dump_json())

    captured = capsys.readouterr()
    assert FAKE_PASSWORD not in captured.out
    assert FAKE_PASSWORD not in captured.err
    assert "**********" in captured.out


def test_get_settings_is_cached(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", FAKE_DB_URL)

    assert get_settings() is get_settings()


def test_env_file_points_to_backend_folder():
    assert config.ENV_FILE.name == ".env"
    assert config.ENV_FILE.parent.name == "backend"
