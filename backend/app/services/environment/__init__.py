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
    StationMeasurement,
    StationReading,
    StationReport,
    WeatherForecast,
)
from app.services.environment.service import EnvironmentService

__all__ = [
    "AirQualityForecast",
    "AirQualityReading",
    "CurrentConditions",
    "DailyTemperature",
    "EnvironmentService",
    "EnvironmentSnapshot",
    "HourlyForecastPoint",
    "ProviderError",
    "ProviderFailure",
    "ProviderNotConfiguredError",
    "ProviderResponseError",
    "ProviderUnavailableError",
    "StationMeasurement",
    "StationReading",
    "StationReport",
    "WeatherForecast",
]
