# Data Model

ORM models live in `backend/app/models/`, API schemas in `backend/app/schemas/`.
Shared limits (lengths, ranges, weekdays) live in `backend/app/core/constants.py`
and are used by **both** database CHECK constraints and Pydantic validation.

Tables are **not** created yet. They will be created by reviewed Alembic migrations
in a later milestone, never by `Base.metadata.create_all()`.

## Entities

```
users 1 ──── * family_members 1 ──── * routines
      (ON DELETE CASCADE)          (ON DELETE CASCADE)
```

### users
| Column | Type | Rules |
|---|---|---|
| id | UUID PK | `uuid4` in Python + `gen_random_uuid()` server default |
| name | varchar(100) | required |
| email | varchar(254) | required, **unique**; lowercase enforced by schema **and** `CHECK (email = lower(email))` |
| password_hash | varchar(255) | required, **internal only**, never in any schema |
| home_lat / home_lon | float | optional; ±90 / ±180; both or neither; rounded to 2 decimals (~1.1 km) by the schemas (the column itself does not round) |
| timezone | varchar(64) | required; IANA name, default `'Asia/Kolkata'`; validated by the schemas with `zoneinfo` |
| consent_at | timestamptz | optional, no default (NULL until consent); set by the server only |
| created_at / updated_at | timestamptz | `now()` defaults; `updated_at` refreshed on ORM updates |

### family_members (sensitive: health-related)
| Column | Type | Rules |
|---|---|---|
| id | UUID PK | as above |
| user_id | UUID FK → users.id | required, indexed, `ON DELETE CASCADE` |
| name | varchar(100) | required |
| age | integer | 0–120 |
| conditions | varchar(50)[] | default `{}`; lowercase codes (`asthma`), max 10, no duplicates |
| sensitivity | float | default 1.0; 0.5–2.0 |
| created_at / updated_at | timestamptz | `now()` defaults; `updated_at` refreshed on ORM updates |

### routines
| Column | Type | Rules |
|---|---|---|
| id | UUID PK | as above |
| member_id | UUID FK → family_members.id | required, indexed, `ON DELETE CASCADE` |
| activity | varchar(100) | required |
| start_time | time (no time zone) | local wall-clock time, interpreted in the owning user's `timezone` |
| days_of_week | varchar(3)[] | non-empty subset of `mon`…`sun` (DB CHECK + schema); stored deduplicated, Monday→Sunday |
| created_at / updated_at | timestamptz | `now()` defaults; `updated_at` refreshed on ORM updates |

## Time zone rules

- Every timestamp (`created_at`, `updated_at`, `consent_at`) is `timestamptz`:
  PostgreSQL stores the exact instant (internally UTC). Read schemas require
  time-zone-aware values.
- `User.timezone` is an IANA name (e.g. `Asia/Kolkata`, `Europe/London`), default
  `Asia/Kolkata`. Validated against `zoneinfo.available_timezones()` (exact,
  case-sensitive match). On Windows this needs the `tzdata` package (pinned).
- `Routine.start_time` is a plain local clock time ("07:30 on weekdays"); it stays
  07:30 across daylight-saving changes and is interpreted in the user's time zone.
  Inputs with a UTC offset (e.g. `07:30+05:30`) are rejected.

## Design decisions

- **password_hash is required.** An account can never exist without a credential.
  Hashing is implemented in the authentication milestone; `UserCreate.password`
  is a `SecretStr` and must never be stored as-is.
- **Deletion cascades.** Deleting a user deletes their family members and routines
  in PostgreSQL (`ON DELETE CASCADE`, ORM `passive_deletes=True`). Orphaned health
  data must not linger. Deletion must only happen through an explicit account
  deletion flow (future milestone).
- **Arrays use `MutableList`.** In-place edits such as `member.conditions.append(...)`
  are detected and saved.
- **Condition codes are format-validated only.** The approved list of conditions is
  a product decision for the risk-engine milestone; the app must never infer them.

## Schemas and data protection

| Schema | Purpose | Notes |
|---|---|---|
| `UserCreate` | sign-up body | name, email, password, optional coordinates, timezone (default Asia/Kolkata) |
| `UserUpdate` | partial update | name, timezone, coordinates (together). Email excluded until re-verification exists |
| `UserRead` | response | no `password_hash`, no password |
| `FamilyMemberCreate/Update/Read` | | no `user_id` in input |
| `RoutineCreate/Update/Read` | | no `member_id` in input |

- Input schemas use `extra="forbid"`: clients cannot set `id`, `user_id`,
  `member_id`, `password_hash`, `consent_at` or timestamps (mass-assignment protection).
- Ownership (`user_id`, `member_id`) will come from the authenticated user and the
  URL path, never from the request body, and must be checked server-side (IDOR).
- Read schemas declare fields explicitly; ORM attributes not listed are never copied.
- Update schemas treat an omitted field as "unchanged" and reject explicit `null`
  for required columns. **Services must apply updates with
  `model_dump(exclude_unset=True)`**: a plain `model_dump()` turns omitted fields
  into `None` (for example, it would erase the home location).
- Numeric fields (age, sensitivity, coordinates) reject JSON booleans, which
  Pydantic would otherwise coerce to 1/0.
- Model `__repr__` shows only the id (no names, emails, health data or hashes).

## Known limitations / follow-ups

- RLS policies, an `updated_at` trigger (for raw SQL updates) and real
  array round-trip tests come with the migration milestone.
- Travel: routines use the home time zone; per-trip time zones may be needed later.
- Routines have no duration/end time yet; exposure calculations may need it.
- `age` becomes stale over time; `birth_year` may be preferable later.
