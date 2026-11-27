# Database Connection

EcoHealth connects to **Supabase PostgreSQL** through **SQLAlchemy 2.x** and the
**Psycopg 3** driver. The code lives in `backend/app/core/database.py`.

## Components

| Name | Role | Lifetime |
|---|---|---|
| `create_db_engine(url)` | Builds an engine with the pool settings below | Called once |
| `get_engine()` | Cached engine for the process, built on first use | Whole process |
| `SessionLocal` | Session factory (`autoflush=False`, `expire_on_commit=False`) | Module |
| `Base` | `DeclarativeBase` for future models, with a constraint naming convention | Module |
| `get_db()` | FastAPI `yield` dependency: one session per request, always closed | One request |

Importing `database.py` never connects and never reads `DATABASE_URL`.
The raw URL is read in exactly one place: `get_engine()`.

ORM models and API schemas are described in [data-model.md](data-model.md).

## Connection URL

Use the Supabase **Session Pooler** (port 5432) with the Psycopg 3 dialect:

```
postgresql+psycopg://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Session mode supports prepared statements, which Psycopg 3 uses automatically.
The Transaction Pooler (port 6543) does not, so it is not used.

## Pool settings

| Setting | Value | Reason |
|---|---|---|
| `pool_pre_ping` | `True` | Replaces connections the pooler or network silently dropped |
| `pool_size` | 3 | Connections kept open per process |
| `max_overflow` | 2 | Temporary extras under load (max 5 per process) |
| `pool_timeout` | 30 s | Wait for a free connection, then raise |
| `pool_recycle` | 1800 s | Refresh long-lived connections |
| `connect_timeout` | 10 s | Fail fast when Supabase is unreachable |

The Session Pooler maps each client connection to a server connection, and small
Supabase plans allow only a limited number. **Each process (dev server, test run,
worker) has its own pool**, so running N processes means up to 5 × N connections.

## Transactions

`get_db()` never commits automatically. Service code calls `db.commit()` explicitly.
On an exception the session is rolled back, closed and the exception is **re-raised**.

## Security notes

- `DATABASE_URL` is a `SecretStr`. SQLAlchemy masks the password (`***`) in `repr(engine)`.
- `hide_parameters=True` keeps SQL parameter values (possibly personal health data) out of errors and logs.
- SQL echo is off.
- `get_db()` does not convert database errors into responses. **To do (FastAPI app milestone):**
  add a global exception handler that returns a generic 500/503 message and logs details server-side only.
- Tables are created only by Alembic migrations, never by `Base.metadata.create_all()`.

## RLS and the privileged connection (important limitation)

The backend connects as the `postgres` role. That role **bypasses Row Level Security**.

- RLS (enabled on every application table) protects data from Supabase's public
  Data API (the `anon` / `authenticated` roles).
- RLS does **not** protect data from this backend. The backend is the authorization
  layer: every query must filter by the current user (for example
  `WHERE owner_id = :current_user_id`).
- Never expose `DATABASE_URL` to the frontend. Never reuse this connection for
  client-supplied raw SQL.

## Tests

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -m unit -v         # no network
.\.venv\Scripts\python.exe -m pytest -m integration -v  # SELECT 1 against Supabase
```

The integration tests **skip** when `DATABASE_URL` is missing or invalid, or when the host is
unreachable, and **fail** when the host is reachable but the query fails
(e.g. wrong password). Failures report only the error type and SQLSTATE.
