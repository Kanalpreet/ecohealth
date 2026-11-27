# Frontend design

The EcoHealth web app lives in `frontend/`. It is a single-page app (SPA): the
browser downloads one HTML page plus JavaScript once, and React then draws every
screen without full page reloads. Rules for working on it: `frontend/CLAUDE.md`.

## 1. Stack and where each library is used

| Library | Used for | Why |
|---|---|---|
| **Vite** | dev server, `/api` proxy, production build | very fast start and rebuilds; simple config; outputs plain static files that Vercel can host |
| **React** (plain JavaScript, `.jsx`) | all UI | the team knows it; no TypeScript by team decision |
| **React Router** | URL ↔ page mapping, protected routes, `?next=` redirects | the standard router for React SPAs |
| **TanStack Query** | all server data (`/me`, later members, risk) | caching, loading/error states and refetching without hand-written `useEffect` code |
| **Tailwind CSS** | styling, design tokens | tokens live in one CSS file; utility classes keep components small; unused CSS is removed at build time |
| **react-hook-form + zod** | forms and validation | fast forms with little re-rendering; zod schemas mirror the backend rules in one readable place |
| **Lucide React** | icons (nav, buttons, states) | clean, consistent, tree-shaken (only icons we import are shipped) |
| **Motion** | small UI animation: page enter, card hover, toasts, modal | declarative React animation; `MotionConfig reducedMotion="user"` turns it off for people who ask for less motion |

Later goes (not installed yet):

| Library | Go | Used for |
|---|---|---|
| **GSAP** + **Lottie** | F2 landing page | scroll-driven storytelling and vector illustrations on `/` only |
| **Recharts** | dashboard / risk | hourly risk charts, factor breakdowns |
| **MapLibre GL JS** | home location, Travel Mode | maps without a paid map key |

Fonts: the system font stack (no web-font downloads), so the first paint is fast
and nothing is fetched at build time.

## 2. Talking to the backend: same-origin `/api`

The browser only ever calls **relative URLs starting with `/api`** (for example
`/api/auth/login`). The real backend address never appears in browser code.

```
Development:   browser ──► Vite (localhost:5173) ──/api/* (prefix removed)──► FastAPI (localhost:8000)
Production:    browser ──► Vercel ──/api/* rewrite──► FastAPI on Render
               browser ──► Vercel ──any other path──► index.html (the SPA)
```

- **Development:** `vite.config.js` has `server.proxy['/api']` with target
  `http://localhost:8000` (overridable with `VITE_DEV_API_TARGET` in
  `frontend/.env.local`), `xfwd: true` (adds `X-Forwarded-For`, so the backend's
  per-IP login limit sees the real client) and a rewrite that strips `/api`
  (FastAPI's routes are `/auth/...`, `/me`, ...).
- **Production:** `frontend/vercel.json` rewrites `/api/:path*` to the backend URL
  (a placeholder until deployment) and every other path to `/index.html`, so deep
  links like `/dashboard` work after a reload.

Why same-origin? Cookies and requests stay "first-party": no CORS preflights, no
`SameSite=None` cookies, and the refresh cookie works in browsers that block
third-party cookies.

**The refresh cookie path.** The browser sees the cookie as coming from
`/api/auth/...`, so the backend sets it with `Path=/api/auth`
(`REFRESH_COOKIE_PATH`, see docs/auth.md). Calling the backend directly (e.g. from
Swagger at `:8000/docs`) therefore does not send the cookie back to `/auth/refresh`;
use the app or set `REFRESH_COOKIE_PATH=/auth` for direct testing.

## 3. Auth in the browser

- **Access token: in memory only** (a React context + a variable inside
  `src/services/api.js`). Never `localStorage`/`sessionStorage`: any script injected
  into the page could read those. Memory is wiped on reload, which is fine because…
- **Refresh token: the backend's httpOnly cookie.** JavaScript cannot read it; the
  browser sends it automatically to `/api/auth/*`.
- **On app load** the app calls `POST /api/auth/refresh` **once**. Success → new
  access token → `GET /api/me` → the user is logged in. 401 → logged out (normal for a
  new visitor). A spinner is shown until this check finishes, so protected pages
  never flash.
- **On any 401** from an API call, `api.js` refreshes once and retries the request
  once. Several requests that fail together share one refresh call (refresh tokens
  rotate, so two parallel refreshes would trip the backend's reuse detection and log
  the user out). If refresh fails the user is logged out and sent to `/login`.
- **Protected routes** (`/dashboard`, later all app pages) redirect to
  `/login?next=<the page>`. After login the app goes to `next` **only if it is a
  same-site path** (starts with a single `/`, not `//` or `/\`, no scheme): this
  prevents "open redirect" phishing links like `/login?next=https://evil.example`.
- **Logout** calls `POST /api/auth/logout` (revokes the token family and clears the
  cookie), drops the in-memory token and clears the TanStack Query cache.

## 4. Errors shown to people

`api.js` turns every failure into an `ApiError` with a plain message:

| Status | Message (summary) |
|---|---|
| network failure | "Can't reach EcoHealth…" |
| 401 (after refresh failed) | session expired, please log in |
| 409 with the no-home-location detail | home location not set (risk pages will offer to set it) |
| other 409 | the backend's message (e.g. email already registered, member limit) |
| 422 | field errors mapped onto form fields (the backend never echoes values) |
| 429 | too many attempts, with the `Retry-After` wait |
| 503 | environmental data temporarily unavailable |
| 500 / other | generic message + request id for support |

## 5. Design system

- **Tokens** (colours, spacing, radius, shadows, type) are CSS variables in
  `src/styles/index.css`, exposed to Tailwind via `@theme`. Calm palette: deep teal
  brand, warm neutral background, slate text.
- **Risk levels** (Low, Moderate, High, Very High, Dangerous) use a colour-blind
  friendly ramp (blue → yellow → orange → vermillion → purple, based on the
  Okabe-Ito palette, not red/green) and are **always shown with the text label and an
  icon** — colour is never the only signal. Text on each risk colour meets WCAG AA.
- **Base components** in `src/components/ui/`: Button, Input, Select, Checkbox,
  Card, RiskBadge, Toast, Spinner, Skeleton, EmptyState, ErrorState, Modal /
  ConfirmDialog. Page layout with a responsive nav is in `src/components/layout/`.

## 6. Motion and accessibility

- **Reduced motion everywhere:** `MotionConfig reducedMotion="user"` wraps the app
  and a global CSS rule shortens all CSS transitions/animations under
  `prefers-reduced-motion: reduce`. Later GSAP/Lottie code must check the same media
  query.
- **Contrast:** WCAG AA (4.5:1 for text, 3:1 for large text and UI borders).
- **Width:** every page works at **360 px** wide (no horizontal scrolling).
- Keyboard: visible focus rings, a "Skip to content" link, dialogs trap focus and
  close on Escape, form errors are linked with `aria-describedby` and announced.
- Health wording: risk screens always show the backend's disclaimer (docs/risk-engine.md).
