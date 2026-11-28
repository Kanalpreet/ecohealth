# Database

EcoHealth uses **Supabase PostgreSQL** through **SQLAlchemy 2.x** and the
**Psycopg 3** driver. Connection code: `backend/app/core/database.py`.
Schema changes: **Alembic** (`backend/migrations/`). Column-level details of every
model and schema: [data-model.md](data-model.md).

## Tables and relationships

```
users 1 ──── * family_members 1 ──── * routines
      ON DELETE CASCADE              ON DELETE CASCADE
```

| Table | Key columns | Notes |
|---|---|---|
| `users` | `id` UUID PK, `email` (unique, lowercase), `password_hash` (internal), `home_lat`/`home_lon` numeric, `timezone`, `consent_at` | One account |
| `family_members` | `id`, `user_id` → users (indexed), `name`, `age` 0–120, `conditions` varchar[], `sensitivity` 0.5–2.0 | Health-related, sensitive |
| `routines` | `id`, `member_id` → family_members (indexed), `activity`, `start_time` (local time), `days_of_week` varchar[] | Recurring activities |

All three tables have `created_at` and `updated_at` (`timestamptz`, default `now()`).

The `env_cache` table (environmental data cache, one row per provider per grid cell,
no user data) is described in [caching.md](caching.md).

### refresh_tokens (authentication, see [auth.md](auth.md))

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK → users.id | indexed, `ON DELETE CASCADE` (deleting a user deletes their tokens) |
| `token_hash` | varchar(64) | **SHA-256 of the token, never the token**; unique (lookup index) |
| `family_id` | UUID | indexed; all tokens rotated from one login; reuse of an old token revokes the family |
| `expires_at` | timestamptz | indexed (cleanup) |
| `revoked_at` | timestamptz | NULL while usable |
| `created_at` | timestamptz | `now()` |

RLS enabled (no policies). `DELETE /me` removes the user; members, routines,
refresh tokens and trips cascade in PostgreSQL.

### Trips (Travel Mode, see [travel.md](travel.md))

```
users 1 ──── * trips 1 ──── * trip_stops        trips * ──── * family_members
      CASCADE          CASCADE                        (trip_members, CASCADE both sides)
```

| Table | Column | Type | Notes |
|---|---|---|---|
| `trips` | `id` | UUID PK | |
| | `user_id` | UUID FK → users.id | indexed, `ON DELETE CASCADE` |
| | `name` | varchar(100) | |
| | `trip_type` | varchar(16) | CHECK in `work`, `holiday`, `trek`, `pilgrimage`, `beach` |
| | `start_date`, `end_date` | date | CHECK `end_date >= start_date` |
| | `created_at`, `updated_at` | timestamptz | `now()`; `updated_at` trigger |
| `trip_stops` | `id` | UUID PK | |
| | `trip_id` | UUID FK → trips.id | `ON DELETE CASCADE`; indexed by the UNIQUE below |
| | `position` | integer | 1, 2, 3 … (travel order); CHECK `>= 1`; **UNIQUE (trip_id, position)** |
| | `place` | varchar(120) | |
| | `lat`, `lon` | numeric(5,2), numeric(6,2) | rounded to 2 decimals; CHECK −90…90 / −180…180 |
| | `elevation_m` | double precision, nullable | from the cached elevation provider; NULL if unavailable |
| | `arrive_date`, `leave_date` | date | CHECK `leave_date >= arrive_date` |
| | `created_at`, `updated_at` | timestamptz | `now()`; `updated_at` trigger |
| `trip_members` | `trip_id` | UUID FK → trips.id | `ON DELETE CASCADE` |
| | `member_id` | UUID FK → family_members.id | `ON DELETE CASCADE`; indexed |
| | | | **PRIMARY KEY (trip_id, member_id)** (also the index for `trip_id`) |

RLS enabled on all three (no policies). Deleting a family member removes them from
their trips; deleting a user deletes their trips. Rules that span rows (stop dates
inside the trip, stops in order, member ownership, limits) are enforced in the API
(app/services/trips.py), the CHECKs above are the single-row safety net.

- **Deleting a user deletes their family members and their routines** (PostgreSQL
  `ON DELETE CASCADE`; the ORM uses `passive_deletes=True` so PostgreSQL does it).
- **`updated_at` trigger**: `public.set_updated_at()` runs `BEFORE UPDATE` on every
  table and sets `updated_at = statement_timestamp()`, so raw SQL updates are covered
  too, not only ORM ones. (`statement_timestamp()` rather than `now()`, which is
  fixed for a whole transaction.)
- **Row Level Security** is enabled on every table with **no policies**: Supabase's
  Data API roles (`anon`, `authenticated`) can read or write nothing. See the RLS
  section below for what this does *not* protect against.
- CHECK constraints: coordinate ranges and both-or-neither, lowercase email, age,
  sensitivity, valid and non-empty `days_of_week`.

## Time zone rules

- Every timestamp (`created_at`, `updated_at`, `consent_at`) is **`timestamptz`**:
  PostgreSQL stores the exact instant (internally UTC) and Psycopg returns
  time-zone-aware Python datetimes.
- `users.timezone` is an **IANA name** (e.g. `Asia/Kolkata`, `Europe/London`),
  default `Asia/Kolkata`, validated by the schemas with `zoneinfo` (needs the
  pinned `tzdata` package on Windows).
- `routines.start_time` is a **plain local clock time** (`time without time zone`).
  "07:30 on weekdays" stays 07:30 across daylight-saving changes and is interpreted
  in the owning user's `timezone`.

## Coordinate rounding

`home_lat` is `numeric(5,2)` and `home_lon` is `numeric(6,2)`: stored rounded to
**2 decimal places (~1.1 km)**. The schemas round half-up first (`28.615` → `28.62`)
and validate the ranges; the column precision also rounds writes that bypass the
schemas, and the CHECK constraints reject values outside ±90 / ±180.

## Connection URL

Use the Supabase **Session Pooler** (port 5432) with the Psycopg 3 dialect:

```
postgresql+psycopg://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

URL-encode special characters in the password (`@` → `%40`).

### Which connection for migrations?

| Option | Port | Migrations? | Why |
|---|---|---|---|
| Direct connection (`db.<ref>.supabase.co`) | 5432 | ✅ | A real PostgreSQL session; IPv6-only on many networks |
| **Session Pooler** (`*.pooler.supabase.com`) | **5432** | ✅ **used** | One server connection per client for the whole session; IPv4-friendly |
| Transaction Pooler | 6543 | ❌ | The server connection changes between transactions, breaking session state, prepared statements and Alembic's DDL transaction |

The app and Alembic use the **same `DATABASE_URL`** (Session Pooler), so no extra
setting is needed. `migrations/env.py` refuses to run if the URL uses port 6543.

## Alembic migrations

`migrations/env.py` reads the URL from `get_settings()` (never from `alembic.ini`),
uses `Base.metadata` (all models imported via `app.models`), sets
`compare_type=True`, and only reflects **our own tables in `public`**: Supabase's
schemas (`auth`, `storage`, `realtime`, …) and any other public tables are never
compared, altered or dropped.

Run from `backend/`:

```powershell
# create a new migration after changing models (always review the file by hand!)
.\.venv\Scripts\alembic.exe revision --autogenerate -m "describe the change"

# apply all migrations
.\.venv\Scripts\alembic.exe upgrade head

# undo the last migration / undo everything (drops our tables and their data!)
.\.venv\Scripts\alembic.exe downgrade -1
.\.venv\Scripts\alembic.exe downgrade base

# where am I? / history
.\.venv\Scripts\alembic.exe current
.\.venv\Scripts\alembic.exe history

# preview the SQL without connecting
.\.venv\Scripts\alembic.exe upgrade head --sql
```

Rules: schema changes only through reviewed migrations (never `create_all()`);
destructive downgrades on real data need explicit approval and a backup.

### Checking the tables in Supabase

Dashboard → your project → **Table Editor** (schema `public`): `users`,
`family_members`, `routines` and `alembic_version`. **Database → Triggers** shows
`trg_*_set_updated_at`; **Authentication → Policies** shows RLS enabled with no policies.
Or in the **SQL Editor**: `select * from alembic_version;`

## Health check

`GET /health/db` runs `SELECT 1` and returns only status and latency:

```json
{"status": "ok", "latency_ms": 42.17}
```

On any failure (database down, bad configuration) it returns **503**
`{"status": "unavailable", "latency_ms": null}` and logs only the exception class
name: never hosts, users, URLs or driver messages.

## Components

| Name | Role | Lifetime |
|---|---|---|
| `create_db_engine(url)` | Builds an engine with the pool settings below | Called once |
| `get_engine()` | Cached engine for the process, built on first use | Whole process |
| `SessionLocal` | Session factory (`autoflush=False`, `expire_on_commit=False`) | Module |
| `Base` | `DeclarativeBase` for all models, with a constraint naming convention | Module |
| `get_db()` | FastAPI `yield` dependency: one session per request, always closed | One request |

Importing `database.py` never connects and never reads `DATABASE_URL`.

## Pool settings

| Setting | Value | Reason |
|---|---|---|
| `pool_pre_ping` | `True` | Replaces connections the pooler or network silently dropped |
| `pool_size` | 3 | Connections kept open per process |
| `max_overflow` | 2 | Temporary extras under load (max 5 per process) |
| `pool_timeout` | 30 s | Wait for a free connection, then raise |
| `pool_recycle` | 1800 s | Refresh long-lived connections |
| `connect_timeout` | 10 s | Fail fast when Supabase is unreachable |

**Each process (dev server, test run, worker) has its own pool**, so running N
processes means up to 5 × N connections. Alembic uses a single, unpooled connection.

## Transactions

`get_db()` never commits automatically. Service code calls `db.commit()` explicitly.
On an exception the session is rolled back, closed and the exception is **re-raised**.

## Security notes

- `DATABASE_URL` is a `SecretStr`. SQLAlchemy masks the password (`***`) in `repr(engine)`.
- `hide_parameters=True` keeps SQL parameter values (possibly personal health data) out of errors and logs.
- SQL echo is off.
- `get_db()` does not convert database errors into responses. **To do:** add a global
  exception handler that returns a generic 500/503 message and logs details server-side only.

## RLS and the privileged connection (important limitation)

The backend connects as the `postgres` role, which **owns** the tables; table owners
are not restricted by Row Level Security.

- RLS protects data from Supabase's public Data API (the `anon` / `authenticated` roles).
- RLS does **not** protect data from this backend. The backend is the authorization
  layer: every query must filter by the current user (for example
  `WHERE user_id = :current_user_id`).
- Never expose `DATABASE_URL` to the frontend. Never reuse this connection for
  client-supplied raw SQL.

## Tests

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -m unit -v         # no network
.\.venv\Scripts\python.exe -m pytest -m integration -v  # against Supabase (needs alembic upgrade head)
```

- Integration tests run every test inside a transaction that is **always rolled back**;
  a final check asserts that no synthetic `it-…@example.com` users remain.
- They **skip** when `DATABASE_URL` is missing/invalid or the host is unreachable,
  and **fail** when the database rejects the connection or the tables are missing.
  Failures report only the error type, SQLSTATE or constraint name.
