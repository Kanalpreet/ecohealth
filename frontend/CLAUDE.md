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
6. **All backend calls go through `src/services/api.js`.** (The only other network calls: place search in `src/services/geocoding.js` and map tiles from OpenFreeMap.) No `fetch` anywhere else. Each
   function there has a comment describing the request and the response fields; keep it
   updated when you add one.
7. **Never store tokens in `localStorage` / `sessionStorage`** (or cookies set from JS).
   The access token lives in memory only (`api.js`); the refresh token is the backend's
   httpOnly cookie. Never log tokens, passwords or health details (no `console.log` of
   API responses).
8. **The backend URL never appears in browser code.** Call relative `/api/...` paths only.
   No secrets in `VITE_*` variables: they are bundled into public JavaScript.
9. No Docker. Windows machine (PowerShell).
10. **Preview (sample) data lives only in `src/lib/previewData.js` and is always labelled
    as sample data**: the small `SampleDataTag` next to the title on Trips pages, the
    `PreviewBanner` on Alerts (both in `components/ui/Preview.jsx`). It is used only
    when a probe endpoint answers 404/501 (`isNotImplemented` in `api.js`, `orPreview` in
    `hooks/useTripsAlerts.js`); never for other errors. In preview, actions that would write
    data are locked (`PreviewLockedButton`, tooltip "Not available in this version"). Trips
    pages never say "coming soon". Never request browser notification permission
    until alerts launch.

## Libraries and where they are used

| Library | Where | Notes |
|---|---|---|
| React (JS) + Vite | everything | Vite proxy `/api` → `http://localhost:8000` (`vite.config.js`) |
| React Router | `src/routes/` | `router.jsx` (routes), `guards.jsx` (ProtectedRoute, PublicOnlyRoute) |
| TanStack Query | server data | client + query keys in `src/lib/queryClient.js`; the user is the `['me']` query |
| Tailwind CSS v4 | all styling | tokens in `src/styles/index.css` (`@theme`); use token utilities (`bg-brand`, `text-muted`), not raw hex |
| react-hook-form + zod | forms | schemas in `src/lib/validation.js` mirror backend rules; server errors via `src/lib/formErrors.js` |
| Lucide React | icons | always `aria-hidden="true"` on decorative icons |
| Motion | UI animation | route/page enter, card hover, toasts, modal, persona switcher, gauge, feature demos; use `useMotionSafe` |
| GSAP (+ ScrollTrigger) | public pages only: Home "the air clears" (`hooks/useAirClearing.js`) | **dynamic `import()` only**, never a static import; skip entirely under reduced motion |
| @fontsource-variable/plus-jakarta-sans | the typeface (imported in `main.jsx`) | self-hosted; never add Google Fonts links |
| Recharts | dashboard hourly chart (lazy) | |
| MapLibre GL JS | location picker, Risk Map, trip route map (lazy, via SafeMap) | |
| @playwright/test + @axe-core/playwright | dev only: `e2e/` test and accessibility checks; `scripts/generate-icons.mjs` | never imported by `src/` |

Do not add other dependencies without agreement.

## Structure

```
src/
  pages/         one component per route (pages/public/ = marketing placeholders)
  components/
    ui/          base components: Button, Input, Select, Checkbox, InteractiveCard, GlassCard,
                 SectionTitle, Badge, RiskBadge (people), AirBadge (air, CPCB), AqiGauge,
                 SafeHoursBar, Toast, Spinner, Skeleton, EmptyState, ErrorState, Alert, Modal,
                 Preview (PreviewBanner, SampleDataTag, PreviewLockedButton)
    air/         AirBackground, GlowCircles, StaticParticles, ParticleField (the "clean air" visuals)
    public/      PublicLayout, Navbar, Footer, PageHeader, CtaBand, Logo
    families/    /for-families sections (flip tiles, same-air card, personalise + setup)
    home/        Home page sections (hero, persona switcher, features, modes)
    features/    /features sections (feature demos, comparison table, travel preview)
    how/         /how-it-works sections (steps, agents flow, why-this-score example, trust + FAQ)
    map/         SafeMap + MapErrorBoundary, MapView (picker map), RiskMap (/map), RouteMap (trips), MapFallback,
                 LocationPicker
    family/      member and routine forms, member card and side panel
    dashboard/   risk status, today card, family risk card, air tint, hourly chart (Recharts, lazy)
    layout/      AppLayout (signed-in app shell)
    AuthProvider.jsx
  hooks/         useAuth, useToast, useMotionSafe, useDocumentTitle, useFamily, useRisk,
                 useTripsAlerts (trips, alerts, alert settings + Preview mode)
  services/      api.js (the only backend client)
  lib/           queryClient, validation, safeNext, risk levels, contexts, helpers,
                 trips (validation, formatting, device-only checklist/seen storage),
                 previewData (the ONLY sample data for Preview mode)
  routes/        router (lazy routes, error boundaries) + route guards
  styles/        index.css (Tailwind + design tokens)
public/          favicon.svg, icons/, og-image.png, manifest.webmanifest, robots.txt
e2e/             Playwright test + axe helper (playwright.config.js at the root)
scripts/         generate-icons.mjs (PNG icons + share image from the logo)
```

Keep component files exporting components only (contexts and helpers live in `lib/`), so
React Fast Refresh and the lint rule `react-refresh/only-export-components` stay happy.

## Accessibility and motion (required)

- Honour `prefers-reduced-motion` everywhere: Motion via `MotionConfig reducedMotion="user"`
  plus `useMotionSafe(...)`; CSS animations are switched off globally in `index.css`.
- Risk levels are **always text + icon + colour** (`RiskBadge`), never colour alone. Missing
  data is "No data", never "Low". **RiskBadge is for people, AirBadge for air quality (CPCB);
  never mix them.**
- Animations: max 1-2 signature animations per page, transform/opacity only, never hide
  information, and add every new one to the inventory in docs/frontend.md §8.
- Never import anything from `frontend/design/` (inspiration images only).
- No photos of people: use icons and initials. Editable site details (contact email,
  GitHub URL, team names) live in `src/lib/siteConfig.js`.
- Statistics on public pages must name and link their source (see `/about`).
- **No nature imagery anywhere**: no mountains, hills, plants, trees, leaves or landscape
  photos/illustrations (SVG, CSS, images or Lottie), and no nature icons (e.g. Lucide
  `Mountain`, `Leaf`, `Trees`), including the logo (`LogoMark`: air-flow lines, keep
  `public/favicon.svg` in sync). Visual direction is "clean air, made
  visible": use `components/air/` (gradient, particles, glow circles) and product-UI previews.
- App risk screens show only API values: anything missing says "Not available". Never mix RiskBadge (people) and AirBadge (air).
- Load MapLibre only through `SafeMap` and Recharts only through `React.lazy`; never import them statically in shared code.
- Sample/demo data on public pages is labelled "Example" or "Sample", never "Live".
- **No decorative "eyebrow" pills** (small label pills above headings). Headings stand on
  their own. Pills/badges are only for information: risk levels, air categories,
  "Example"/"Preview"/"Coming soon" tags, filters and chips.
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
is in `vercel.json`; replace the `BACKEND_URL` placeholder when deploying.

## End-to-end test (Playwright)

One happy-path test in `e2e/happy-path.spec.js`. It runs against the **real local stack**:
it registers a uniquely named user, goes through onboarding, adds a member and a routine,
checks the dashboard and member detail, logs out, and checks the login redirect and the 404
page. Along the way it runs axe (WCAG 2.1 AA, serious/critical issues fail) and keyboard
checks. It always deletes the account at the end (`DELETE /me`), so nothing is left in
Supabase.

```powershell
# terminal 1: the backend (see root CLAUDE.md)
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app --reload

# terminal 2
cd frontend
npx playwright install chromium   # first time only (downloads the test browser)
npm run test:e2e                  # starts or reuses the Vite dev server on :5173
npx playwright show-report        # HTML report (traces/screenshots on failure)
```

The test needs internet access (place search and map tiles). When you change a flow it
covers, update the test. Allowed HTTP errors and console messages are listed at the top of
the spec; don't widen them to hide real errors.

Checks that must pass: `npm run lint`, `npm run build`, `npm run test:e2e`, and the backend
suite if anything in `backend/` changed.

## Performance, SEO and deployment

- Every layout and page is a **lazy route** (`routes/router.jsx`); keep new pages lazy. Long-lived
  vendor chunks are defined in `vite.config.js`. Don't add heavy libraries to them.
- Each section has an error boundary (`SectionErrorPage`); unknown URLs show `NotFoundPage`.
- Public pages pass a description to `useDocumentTitle(title, PAGE_DESCRIPTIONS.x)` (`lib/seo.js`).
- Icons and the share image come from `node scripts/generate-icons.mjs`; the manifest is
  `public/manifest.webmanifest`. No service worker or push yet.
- Deploying (Vercel) and the backend's production settings: docs/frontend.md §11.
