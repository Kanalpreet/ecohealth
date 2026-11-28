# EcoHealth

An agentic AI Climate Health Intelligence Platform (final-year B.Tech project). EcoHealth turns
environmental conditions (air pollution, heat, cold, UV, altitude) into personalised
climate-health awareness for a user and their family.

- `backend/`: FastAPI, SQLAlchemy, Alembic and Supabase PostgreSQL. The risk engine is
  deterministic Python.
- `frontend/`: Vite and React (plain JavaScript) with Tailwind.
- `docs/`: design and API documents. Start with [design.md](design.md) 

## Run the backend


In short, from `backend/`:

```powershell
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m uvicorn main:app --reload   # http://127.0.0.1:8000
```

## Run the frontend

Requirements: Node.js 20.19+ (or 22.12+) and the backend running on http://localhost:8000.

```powershell
cd frontend
npm install
npm run dev          # http://localhost:5173 (calls the backend through the /api proxy)
npm run lint
npm run build        # production build in frontend/dist
npm run test:e2e     # end-to-end + accessibility test (first time: npx playwright install chromium)
```

No frontend environment file is needed. To use another backend while developing, copy
`frontend/.env.example` to `frontend/.env.local` and change `DEV_API_TARGET`.

- 
