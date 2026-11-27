"""User API schemas. password_hash is deliberately absent from every schema."""

import uuid
import zoneinfo
from decimal import ROUND_HALF_UP, Decimal
from functools import lru_cache
from typing import Annotated, Self

from pydantic import (
    AfterValidator,
    AwareDatetime,
    EmailStr,
    Field,
    SecretStr,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.core.constants import (
    DEFAULT_TIMEZONE,
    HOME_COORDINATE_DECIMALS,
    LAT_MAX,
    LAT_MIN,
    LON_MAX,
    LON_MIN,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    TIMEZONE_MAX_LENGTH,
)
from app.schemas.common import InputSchema, Name, NotBool, ReadSchema, reject_explicit_nulls

# Decimal (not float) so rounding is exact and matches the Numeric(…, 2) columns.
# Ranges are checked on the raw value, then rounded (see _round_coordinate).
Latitude = Annotated[Decimal, NotBool, Field(ge=LAT_MIN, le=LAT_MAX, allow_inf_nan=False)]
Longitude = Annotated[Decimal, NotBool, Field(ge=LON_MIN, le=LON_MAX, allow_inf_nan=False)]
_COORDINATE_QUANTUM = Decimal(1).scaleb(-HOME_COORDINATE_DECIMALS)  # Decimal("0.01")


@lru_cache
def _iana_timezones() -> frozenset[str]:
    # Requires the tzdata package on Windows (pinned in requirements.txt).
    return frozenset(zoneinfo.available_timezones())


def _validate_timezone(value: str) -> str:
    # Membership check (not ZoneInfo(value)) so arbitrary strings never reach
    # the file-based zone loader.
    if value not in _iana_timezones():
        raise ValueError("timezone must be a valid IANA time zone name, e.g. Asia/Kolkata")
    return value


TimeZoneName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=TIMEZONE_MAX_LENGTH),
    AfterValidator(_validate_timezone),
]


def _round_coordinate(value: Decimal | None) -> Decimal | None:
    # Half-up rounding to 2 decimals (~1.1 km); e.g. 28.615 -> 28.62.
    return None if value is None else value.quantize(_COORDINATE_QUANTUM, rounding=ROUND_HALF_UP)


class UserCreate(InputSchema):
    name: Name
    email: EmailStr
    # SecretStr prints as '**********'. Hashing happens in the auth milestone;
    # this plain value must never be stored.
    password: SecretStr = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)
    home_lat: Latitude | None = None
    home_lon: Longitude | None = None
    timezone: TimeZoneName = DEFAULT_TIMEZONE

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: str) -> str:
        return value.lower()

    _round = field_validator("home_lat", "home_lon")(_round_coordinate)

    @model_validator(mode="after")
    def coordinates_together(self) -> Self:
        if (self.home_lat is None) != (self.home_lon is None):
            raise ValueError("home_lat and home_lon must be provided together")
        return self


class UserUpdate(InputSchema):
    """Partial update. Email changes are excluded until re-verification exists (auth milestone)."""

    name: Name | None = None
    home_lat: Latitude | None = None
    home_lon: Longitude | None = None
    timezone: TimeZoneName | None = None

    _round = field_validator("home_lat", "home_lon")(_round_coordinate)

    @model_validator(mode="after")
    def validate_partial_update(self) -> Self:
        reject_explicit_nulls(self, ("name", "timezone"))
        lat_sent = "home_lat" in self.model_fields_set
        lon_sent = "home_lon" in self.model_fields_set
        if lat_sent != lon_sent or (self.home_lat is None) != (self.home_lon is None):
            # Both null together clears the home location; anything else must pair up.
            raise ValueError("home_lat and home_lon must be updated together")
        return self


class UserRead(ReadSchema):
    id: uuid.UUID
    name: str
    email: str
    home_lat: float | None
    home_lon: float | None
    timezone: str
    consent_at: AwareDatetime | None
    created_at: AwareDatetime
    updated_at: AwareDatetime
