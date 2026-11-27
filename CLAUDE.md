# CLAUDE.md

Guidance for AI coding assistants working on this repository.
**Read [design.md](design.md) first**: it is the binding engineering, security,
privacy and Git policy. If anything here conflicts with it, design.md wins.

## Project

**EcoHealth** is an agentic AI Climate Health Intelligence Platform (final-year
B.Tech project). It turns environmental conditions (air pollution, heat, cold, UV,
altitude) into personalised climate-health awareness for a user and their family.

- **Home Mode**: daily risk awareness at home, based on family profiles and routines.
- **Travel Mode**: risk awareness for trips (built only after Home Mode passes end-to-end testing).
- **AI design**: a 4-agent LangGraph workflow (one agent is the **Safety reviewer**).
  The Climate Health Score itself is computed by deterministic Python, not by an LLM.

## Tech stack

- Backend: Python 3.12, **FastAPI**, **Pydantic** / Pydantic Settings
- Database: **Supabase PostgreSQL**, **SQLAlchemy 2.x**, Psycopg 3, **Alembic**
- Tests: **pytest** (`unit`, `integration` and `external` markers)
- Later: Next.js + TypeScript + Tailwind frontend, LangGraph, Groq (Ollama fallback), ChromaDB, Langfuse

Key docs: [docs/database.md](docs/database.md), [docs/data-model.md](docs/data-model.md),
[docs/configuration.md](docs/configuration.md), [docs/environment-data.md](docs/environment-data.md),
[docs/caching.md](docs/caching.md).

Environmental data sources: **Open-Meteo** (weather, air quality, elevation; no key)
and **OpenAQ v3** (ground stations; optional `OPENAQ_API_KEY`). **NASA FIRMS / fire
data is not used.** Alerts (later) will use **email and browser web push**, not Telegram.

Provider results are cached per provider per grid cell (0.05°) in the `env_cache`
table: use `CachedEnvironmentService` (not `EnvironmentService` directly) in app code.
Every snapshot says per provider whether data is `live`, `cache` or `stale`.

## Run on Windows (PowerShell)

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env          # then fill in DATABASE_URL (Session Pooler, port 5432)

.\.venv\Scripts\alembic.exe upgrade head                 # create/update tables
.\.venv\Scripts\python.exe -m uvicorn main:app --reload  # http://127.0.0.1:8000/health/db

.\.venv\Scripts\python.exe -m pytest -m unit             # no database needed
.\.venv\Scripts\python.exe -m pytest -m integration      # real Supabase, rolled back
.\.venv\Scripts\python.exe -m pytest -m external         # live third-party APIs (skips if offline/no key)
.\.venv\Scripts\python.exe -m pytest                     # everything
```

Demo of the cached environmental data service (Delhi and Leh, real APIs + Supabase;
run it twice: first `LIVE`, then `CACHE`), from the repo root:

```powershell
backend\.venv\Scripts\python.exe scripts\fetch_environment.py
```

## Rules

1. **No Docker** (or Docker Compose).
2. Work **one milestone / go at a time**; don't start the next unless asked.
3. **Explain unfamiliar concepts** before implementing them.
4. **Every feature needs tests** (unit tests separate from integration tests).
5. **Never hardcode or print secrets** (`DATABASE_URL`, passwords, API keys); use `backend/.env` + Pydantic Settings.
6. **Never let an LLM calculate the Climate Health Score**: it is deterministic, tested Python.
7. **No AI recommendation may bypass the Safety reviewer.**
8. **Health guidance must be grounded in approved sources**; never invent medical facts.
9. **Timestamps are `timestamptz` in UTC; routine times are local times interpreted in `User.timezone`.**
10. **Schema changes only through Alembic migrations** (reviewed by hand; never `create_all()`).
11. **Update docs after each major feature.**
12. **Don't start Travel Mode before Home Mode passes end-to-end testing.**

Also (from design.md): never add AI co-authors or `Co-authored-by:` trailers, and
don't commit or push unless the owner asks.
