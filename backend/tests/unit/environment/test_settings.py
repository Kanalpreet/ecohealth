"""Environment-related settings: OpenAQ key is optional and never exposed."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings

pytestmark = pytest.mark.unit

DB = "postgresql+psycopg://u:p@localhost:5432/db"


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    for key in ("OPENAQ_API_KEY", "OPENAQ_MAX_AGE_HOURS", "DATABASE_URL"):
        monkeypatch.delenv(key, raising=False)


def make(**kwargs) -> Settings:
    return Settings(_env_file=None, database_url=DB, **kwargs)


def test_openaq_key_is_optional_with_defaults():
    s = make()
    assert s.openaq_api_key is None
    assert s.openaq_max_age_hours == 3.0


@pytest.mark.parametrize("blank", ["", "   "])
def test_blank_openaq_key_means_unset(blank):
    assert make(openaq_api_key=blank).openaq_api_key is None


def test_openaq_key_is_masked(monkeypatch):
    monkeypatch.setenv("OPENAQ_API_KEY", "super-secret-openaq-key")
    s = Settings(_env_file=None, database_url=DB)
    assert s.openaq_api_key.get_secret_value() == "super-secret-openaq-key"
    for text in (repr(s), str(s), s.model_dump_json()):
        assert "super-secret-openaq-key" not in text


@pytest.mark.parametrize(("value", "ok"), [(0.5, True), (72, True), (0, False), (-1, False), (73, False)])
def test_max_age_hours_bounds(value, ok):
    if ok:
        assert make(openaq_max_age_hours=value).openaq_max_age_hours == value
    else:
        with pytest.raises(ValidationError):
            make(openaq_max_age_hours=value)
