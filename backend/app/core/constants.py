"""Domain limits shared by database CHECK constraints and Pydantic schemas.

Keeping them in one place means the database and the API can never disagree.
"""

from typing import Literal, get_args

# ---- Text lengths ----
NAME_MAX_LENGTH = 100
EMAIL_MAX_LENGTH = 254  # RFC 5321 practical maximum
ACTIVITY_MAX_LENGTH = 100
CONDITION_CODE_MAX_LENGTH = 50
PASSWORD_MIN_LENGTH = 10  # NIST SP 800-63B-style policy, see docs/auth.md
PASSWORD_MAX_LENGTH = 128

# ---- Coordinates ----
LAT_MIN, LAT_MAX = -90.0, 90.0
LON_MIN, LON_MAX = -180.0, 180.0
# Home coordinates are rounded to 2 decimals (~1.1 km). Environmental data is
# grid-based at km scale, and coarser storage limits exposure of exact homes.
HOME_COORDINATE_DECIMALS = 2
HOME_LAT_PRECISION = 5  # Numeric(5,2): -90.00 .. 90.00
HOME_LON_PRECISION = 6  # Numeric(6,2): -180.00 .. 180.00

# ---- Family members ----
AGE_MIN, AGE_MAX = 0, 120
SENSITIVITY_MIN, SENSITIVITY_MAX = 0.5, 2.0
SENSITIVITY_DEFAULT = 1.0
MAX_CONDITIONS = 10
# Format only (e.g. "asthma", "heart_disease"). The approved list of
# conditions is a product decision for the risk-engine milestone.
CONDITION_CODE_PATTERN = r"^[a-z][a-z0-9_]*$"

# ---- Time zones ----
# IANA name (e.g. "Asia/Kolkata"). Routine start times are local clock times
# interpreted in the user's time zone.
DEFAULT_TIMEZONE = "Asia/Kolkata"
TIMEZONE_MAX_LENGTH = 64

# ---- Routines ----
Weekday = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
WEEKDAYS: tuple[str, ...] = get_args(Weekday)
