# frontend/CLAUDE.md

Rules for AI coding assistants working in `frontend/`. The root [CLAUDE.md](../CLAUDE.md)
and [design.md](../design.md) still apply; the frontend design is in
[docs/frontend.md](../docs/frontend.md).

## Hard rules

1. **Plain JavaScript only**: `.js` / `.jsx` files. No TypeScript, no `.ts`/`.tsx`, no `tsconfig`.
2. **Never run `git commit`, `git push`, or create pull requests**; developers commit manually.
3. **Never add `Co-Authored-By` lines or "Generated with Claude Code" text** anywhere
   (commits, PRs, code comments, docs).
4. **`python` is not on PATH.** Use the backend venv: `backend\.venv\Scripts\python.exe`
   (e.g. `backend\.venv\Scripts\python.exe -m pytest`). Use `py` only to create a new venv.
5. **Work only in `frontend/`** unless a backend/docs change has been agreed first.
6. **All backend calls go through `src/services/api.js`.** No `fetch` anywhere else. Each
   function there has a comment describing the request and the response fields; keep it
   updated when you add one.
7. **Never store tokens in `localStorage` / `sessionStorage`** (or cookies set from JS).
   The access token lives in memory only (`api.js`); the refresh token is the backend's
   httpOnly cookie. Never log tokens, passwords or health details (no `console.log` of
   API responses).
8. **The backend URL never appears in browser code.** Call relative `/api/...` paths only.
   No secrets in `VITE_*` variables: they are bundled into public JavaScript.
9. No Docker. Windows machine (PowerShell).

## Libraries and where they are used

| Library | Where | Notes |
|---|---|---|
| React (JS) + Vite | everything | Vite proxy `/api` → `http://localhost:8000` (`vite.config.js`) |
| React Router | `src/routes/` | `router.jsx` (routes), `guards.jsx` (ProtectedRoute, PublicOnlyRoute) |
| TanStack Query | server data | client + query keys in `src/lib/queryClient.js`; the user is the `['me']` query |
| Tailwind CSS v4 | all styling | tokens in `src/styles/index.css` (`@theme`); use token utilities (`bg-brand`, `text-muted`), not raw hex |
| react-hook-form + zod | forms | schemas in `src/lib/validation.js` mirror backend rules; server errors via `src/lib/formErrors.js` |
| Lucide React | icons | always `aria-hidden="true"` on decorative icons |
| Motion | small UI animation | page enter (`AppLayout`), card hover (`Card`), toasts, modal; use `useMotionSafe` |
| GSAP + Lottie | **later (F2)**, landing page `/` only | must check `prefers-reduced-motion` |
| Recharts | **later**, risk charts | |
| MapLibre GL JS | **later**, maps (home location, Travel Mode) | |

Do not add other dependencies without agreement.

## Structure

```
src/
  pages/         one component per route
  components/
    ui/          base components: Button, Input, Select, Checkbox, Card, RiskBadge/Badge,
                 Toast, Spinner, Skeleton, EmptyState, ErrorState, Alert, Modal/ConfirmDialog
    layout/      AppLayout (header, responsive nav, footer)
    AuthProvider.jsx
  hooks/         useAuth, useToast, useMotionSafe, useDocumentTitle
  services/      api.js (the only backend client)
  lib/           queryClient, validation, safeNext, risk levels, contexts, helpers
  routes/        router + route guards
  styles/        index.css (Tailwind + design tokens)
```

Keep component files exporting components only (contexts and helpers live in `lib/`), so
React Fast Refresh and the lint rule `react-refresh/only-export-components` stay happy.

## Accessibility and motion (required)

- Honour `prefers-reduced-motion` everywhere: Motion via `MotionConfig reducedMotion="user"`
  plus `useMotionSafe(...)`; CSS animations are switched off globally in `index.css`.
- Risk levels are **always text + icon + colour** (`RiskBadge`), never colour alone. Missing
  data is "No data", never "Low".
- WCAG AA contrast (4.5:1 text, 3:1 UI borders). Use the existing tokens; check new colours.
- Every page must work at **360 px** wide with no horizontal scrolling.
- Every input has a visible `<label>`; errors use `aria-invalid` + `aria-describedby`.
  Touch targets are at least 44 px (`min-h-11`). Keep visible focus rings.
- Show the backend's disclaimer on every risk screen.
- Redirects after login use `safeNext()` (same-site paths only).

## Run, lint, build (PowerShell, from the repo root)

The backend must be running on http://localhost:8000 (see root CLAUDE.md).

```powershell
cd frontend
npm install          # first time / after dependency changes
npm run dev          # http://localhost:5173 (proxies /api to the backend)
npm run lint
npm run build        # production build in frontend/dist
```

Optional: copy `.env.example` to `.env.local` to point the dev proxy at another backend
(`DEV_API_TARGET`). Production routing (`/api/*` → backend, everything else → `index.html`)
is in `vercel.json`; replace the placeholder backend URL when deploying.

No frontend unit/e2e tests yet (e2e arrives in F6). Checks that must pass: `npm run lint`,
`npm run build`, and the backend suite if anything in `backend/` changed.
