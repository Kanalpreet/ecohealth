"""Environmental data: Open-Meteo (weather, air quality, elevation) and OpenAQ v3.

Use EnvironmentService.get_snapshot(); see docs/environment-data.md.
"""

from app.services.environment.errors import (
    ProviderError,
    ProviderNotConfiguredError,
    ProviderResponseError,
    ProviderUnavailableError,
)
from app.services.environment.models import (
    AirQualityForecast,
    AirQualityReading,
    CurrentConditions,
    DailyTemperature,
    EnvironmentSnapshot,
    HourlyForecastPoint,
    ProviderFailure,
    GridCell,
    ProviderSource,
    StationMeasurement,
    StationReading,
    StationReport,
    WeatherForecast,
)
from app.services.environment.service import EnvironmentService
from app.services.environment.cache import CachedEnvironmentService  # noqa: E402,I001 (after service)

__all__ = [
    "AirQualityForecast",
    "AirQualityReading",
    "CachedEnvironmentService",
    "CurrentConditions",
    "DailyTemperature",
    "EnvironmentService",
    "EnvironmentSnapshot",
    "HourlyForecastPoint",
    "ProviderError",
    "ProviderFailure",
    "GridCell",
    "ProviderNotConfiguredError",
    "ProviderSource",
    "ProviderResponseError",
    "ProviderUnavailableError",
    "StationMeasurement",
    "StationReading",
    "StationReport",
    "WeatherForecast",
]
