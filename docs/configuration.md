# Backend Configuration

EcoHealth's backend reads its configuration through `backend/app/core/config.py`,
which uses Pydantic Settings.

## Flow

```
OS environment variables ─┐ (highest priority)
backend/.env ─────────────┼─► Settings (validated, typed) ─► get_settings() (cached)
Class defaults ───────────┘ (lowest priority)
```

Application code should call `get_settings()` rather than create `Settings()`
directly. The settings are built once and then reused.

## Keys

| Key | Type | Default | Secret |
|---|---|---|---|
| `APP_NAME` | str | `EcoHealth API` | No |
| `APP_ENV` | `development` / `test` / `production` | `development` | No |
| `DEBUG` | bool | `false` | No |
| `DATABASE_URL` | SecretStr (required) | none | **Yes** |

Key names are case-insensitive. `DATABASE_URL` must start with
`postgresql+psycopg://` (the SQLAlchemy dialect for the Psycopg 3 driver) and
should point to the Supabase **Session Pooler** on port 5432.

## Secret handling

- `backend/.env` is ignored by Git. Only `backend/.env.example` (placeholders) is committed.
- `DATABASE_URL` is a `SecretStr`: `print(settings)` shows `**********`.
  Read the real value with `settings.database_url.get_secret_value()`, and only where a connection is created.
- `hide_input_in_errors=True` keeps raw values out of validation errors.
- `get_settings()` raises `ConfigurationError`, which lists only field names and reasons, never values.

## Local setup (PowerShell)

```powershell
Copy-Item backend\.env.example backend\.env
notepad backend\.env
```
