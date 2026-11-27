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
| **Motion** | UI animation: route transitions, card hover, toasts, modal, persona switcher, gauge, feature demos | declarative React animation; `MotionConfig reducedMotion="user"` + `useMotionSafe` turn it off for people who ask for less motion |
| **GSAP** + ScrollTrigger | Home hero "the air clears" (public pages only) | best-in-class scroll-scrubbed animation; **dynamic import only**, so it is a separate lazy chunk and never in the app bundle |
| **@fontsource-variable/plus-jakarta-sans** | the one typeface | self-hosted woff2 bundled by Vite: no Google Fonts requests; the browser downloads only the subsets a page needs |

Later goes (not installed yet):

| Library | Go | Used for |
|---|---|---|
| **Recharts** | dashboard / risk | hourly risk charts, factor breakdowns |
| **MapLibre GL JS** | home location, Travel Mode | maps without a paid map key |

## 2. Talking to the backend: same-origin `/api`

The browser only ever calls **relative URLs starting with `/api`** (for example
`/api/auth/login`). The real backend address never appears in browser code.

```
Development:   browser ──► Vite (localhost:5173) ──/api/* (prefix removed)──► FastAPI (localhost:8000)
Production:    browser ──► Vercel ──/api/* rewrite──► FastAPI on Render
               browser ──► Vercel ──any other path──► index.html (the SPA)
```

- **Development:** `vite.config.js` has `server.proxy['/api']` with target
  `http://localhost:8000` (overridable with `DEV_API_TARGET` in
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

Colours, glass and layout were derived from the inspiration images in `frontend/design/`
(style and mood only; the app never imports anything from that folder).

**Visual direction: "clean air, made visible".** There is **no nature imagery anywhere**:
no mountains, hills, plants, trees, leaves or landscape photos/illustrations, and no
image assets at all. Atmosphere comes from:

- **`AirBackground`** (`components/air/AirBackground.jsx`): a soft gradient of mint,
  white and a hint of sky blue, made of three large blurred colour fields that drift
  very slowly with CSS transforms (`animate-air-a/b/c`, 28-44 s). Used behind the
  hero, page headers, the mode-card previews, the Travel preview and the auth panel.
- **Particles** = PM2.5: `ParticleField` (animated canvas, Home hero only) and
  `StaticParticles` (a few faint fixed dots, page headers).
- **`GlowCircles`**: soft blurred circles (light or dark tone) as accents (CtaBand,
  Travel preview, auth panel).
- **Product UI instead of photos**: mode cards show mini previews built from real
  components (family RiskBadges; Delhi → Leh route), always tagged "Example".

**Brand mark** (`LogoMark` in `components/public/Logo.jsx`, mirrored in
`public/favicon.svg`, also used in the app header): a deep-green rounded square with three
white flowing air lines (two curl like a breeze) and one small mint dot, a clean
particle. No leaf or other nature shape.

- **Tokens** live in `src/styles/index.css` (`@theme`, so each one is a Tailwind
  utility):
  - **Colour:** deep forest green brand (`brand` #166534, `forest` #0e3b22), mint
    (`brand-soft`, `mint`, `mint-strong`), green text accent (`accent`), a misty
    mint-white canvas and green-tinted ink.
  - **Glass:** the `.glass` class / `GlassCard` (68% white, 18px backdrop blur, soft
    green shadow, falls back to 85% white where blur is unsupported).
  - **Shape and type:** large radii (`rounded-card` 24px, `rounded-panel` 32px,
    pills), soft green shadows, a fluid type scale (`text-display`, `text-h1`,
    `text-h2`, `text-h3`, `text-lead`, 360 → 1440 px) in **Plus Jakarta Sans**.
- **Two separate badge systems, never mixed:**
  - **RiskBadge** (`components/ui/RiskBadge.jsx`, `lib/risk.js`): a *person's* risk.
    Low green, Moderate yellow, High orange, Very High red, Dangerous purple. Soft
    tinted pill with dark same-hue text (6.4:1 or better) **plus an icon and the text
    label**, so colour is never the only signal (that also covers red/green colour
    blindness). Missing data shows "No data", never "Low".
  - **AirBadge** (`components/ui/AirBadge.jsx`, `lib/aqi.js`): *air quality* by the
    CPCB National AQI categories Good, Satisfactory, Moderate, Poor, Very Poor and
    Severe (CPCB's band of dark green, light green, yellow, orange, red and maroon).
    It accepts the backend's names ("Moderately polluted", "Very poor") or a number.
- **Base components** (`src/components/ui/`): Button, Input, Select, Checkbox, Card,
  GlassCard, Pill, SectionTitle (+ Highlight), Badge (neutral), RiskBadge, AirBadge,
  AqiGauge, SafeHoursBar, FactorBar, Toast, Spinner, Skeleton, EmptyState, ErrorState,
  Alert, Modal / ConfirmDialog.
  - **AqiGauge:** a semicircle with the six CPCB bands, a rotating marker and a
    count-up number.
  - **SafeHoursBar:** a time axis with safe segments, an optional "now" marker (it
    glides with transform when `now` changes) and the safe hours always written out as
    text.
  - **FactorBar** (`components/ui/FactorBar.jsx`, reused on the dashboard in F4): the
    "why this score" breakdown.
    - **Props:**
      - `factors`: bar segments `{ id, name, share, className }`; the shares add up
        to 100.
      - `rows` (optional): factor rows `{ id, factorId?, icon, label, value }`. A row
        without a segment is allowed, e.g. "Heat – none".
      - `revealed`: how many segments are filled.
      - `stagger`: seconds between segments filling.
    - **Text:** the name and % of every share are always written out. Without `rows`,
      it shows a compact legend instead.
    - **Linked highlighting:** hovering or focusing a segment highlights its row, and
      the row highlights its segment.
      - Segments have static, focusable hit areas (`role="img"`, labelled
        "Air quality: 93% of the score") over the animated bar.
      - Linked rows are focusable.
- **`hooks/useDemoLoop`:** the step clock for small looping demos. It runs only while
  the demo is at least 40% on screen (pauses off screen) and returns the final step
  under reduced motion.

## 6. Public site (F2.1)

- Routes `/`, `/features`, `/how-it-works`, `/for-families`, `/about`, `/login` and
  `/register` share `components/public/PublicLayout` (Navbar, page, Footer).
  `/dashboard` keeps the app layout. Public pages are **lazy-loaded routes**.
- **Navbar:**
  - Air-flow logo, five links with the active page as a mint pill, then "Log in" /
    "Sign up" (or "Go to dashboard" when logged in).
  - Sticky; a glass layer fades in after scrolling.
  - Hamburger menu below 1024 px (Escape closes it and returns focus).
- **Footer:**
  - Product / Company / Account columns.
  - Data attribution: Open-Meteo (CC BY 4.0, linked) and OpenAQ.
  - The risk-awareness disclaimer and © 2026 EcoHealth. No social icons.
- **PageHeader** (air gradient with faint static particles + pill + title + subtitle)
  and **CtaBand** (solid deep green, subtle gradient, soft glowing circles) are reused
  on every public page.
- **Footer links:** Travel Mode → `/features#travel-mode` (the Travel preview section),
  Privacy → `/privacy`, Contact → `/contact`. Every footer and navbar link has a real
  page.
- **`/for-families`** (F2.4, `components/families/`):
  - PageHeader.
  - **Flip tiles:** Children, Elderly parents, Asthma & COPD, Heart conditions,
    Pregnancy, Outdoor workers. Each is a `<button aria-pressed>`; the back shows "What
    we watch for" chips and one tip. The hidden face is `aria-hidden`.
  - **"Same air, different risk"** card (Example): AirBadge Poor (AQI 240), then three
    people with RiskBadges. Each "Why?" is a disclosure button (`aria-expanded`); the
    reason text is reused from `home/personas.js`.
  - **"How we personalise":** Age, Health conditions, Sensitivity. These match the
    engine's age modifiers, condition multipliers and 0.5-2.0 sensitivity.
  - **"Set up your family in 2 minutes":** three mini steps and a Get started link
    (`/register`).
  - CtaBand.
- **`/about`** (F2.4):
  - **"Why we built EcoHealth":** three impact stats with count-ups, each with its
    source named on the card and linked in a "Sources" list:
    - State of Global Air 2025: about 2 million deaths in India in 2023.
    - Frontiers in Environmental Health 2026 (doi 10.3389/fenvh.2026.1789071): ~30,000
      modelled excess deaths from one five-day heatwave, a conservative estimate.
    - Global Asthma Report 2022, India page: about 35 million people with asthma.
    - All three were checked against the sources in Nov 2026.
  - **Product stats:** 24/7, 6 factors, 2 modes.
  - **Principles.**
  - **Data and credits:** Open-Meteo CC BY 4.0, OpenAQ, WHO, CPCB, NDMA, GINA.
  - **Team:** initials, no photos. Placeholder names live in `lib/siteConfig.js`.
  - The disclaimer box, then CtaBand.
- **`/privacy`:** a plain-language prototype notice. It covers what we collect, why,
  what we never do and your control, and that EcoHealth aims to follow the principles
  of India's DPDP Act 2023. Every statement matches today's backend. Have it reviewed
  before a public launch.
- **`/contact`:** an email (`mailto:`) and a GitHub link, both placeholders in
  `lib/siteConfig.js`. No form.
- **No photos of people:** use icons and initials.
- **No images:** there are no photo or illustration assets. Backgrounds are
  `AirBackground` / `GlowCircles`, and previews are built from real components.
- **Auth pages** (`/login`, `/register`, `components/AuthCard.jsx`):
  - From 1024 px: a split card. The left panel is the air gradient with the logo, the
    tagline and a gently floating **Example** risk card (AirBadge, RiskBadge, safe
    hours).
  - Below 1024 px: the form card only.
- **Home hero card** uses clearly labelled **Example** data (never "Live"):
  - AQI 240 (Poor), with three sample people. The explanations describe the real
    engine weights (asthma, heart disease, age modifiers in `risk_config.py`).
  - Data: `components/home/personas.js`.
- **`/features`** (F2.2, `pages/public/FeaturesPage.jsx`, `components/features/`):
  - PageHeader, then six feature GlassCards with mini demos (3/2/1 columns).
  - The "Why EcoHealth is different" comparison: a real `<table>` from 768 px,
    stacked cards below. The table is `display:none` on mobile, so nothing is read
    twice. Icons have text: a visible legend, plus screen-reader labels in cells.
  - The Travel Mode preview: an Example trip plan; "Plan a trip" goes to
    `/register`, with a "Trips are coming soon" badge.
  - CtaBand.
  - All demo data is sample data; each card's visual is `aria-hidden` and an sr-only
    sentence states what it shows. Uses Motion only: no GSAP in this chunk.
- **`/how-it-works`** (F2.3, `pages/public/HowItWorksPage.jsx`, `components/how/`):
  - PageHeader.
  - **Four user steps:** numbered circles, icons and a line that draws as you scroll.
    It runs horizontally from 1024 px and vertically below.
  - **"What happens behind every alert"** (`AgentFlow`):
    - The flow: Gather data (code) → Score risk (code) → Context analyst + Health
      knowledge (AI agents, side by side = in parallel) → Advisor → Safety reviewer
      → an **Example** alert card.
    - Node styles differ by shape and a text tag, not colour alone: agents are dashed
      and rounded with an "AI agent" tag; code is solid and square with a
      "Plain code" tag. A legend explains this.
    - Two layouts of the same content: horizontal from 1024 px, vertical below. The
      hidden one is `display:none`, so screen readers get one ARIA list.
  - **"Why this score?"**: the FactorBar example for Priya (score 66 Very High, AQI
    313 Very Poor, Air quality 93%, Temperature swing 7%). UV is shown as "index 2,
    low", consistent with the engine (UV < 3 adds nothing).
  - **"Built to be trusted"**: four cards.
  - **FAQ:** an accordion. Each answer is opened by a `<button aria-expanded
    aria-controls>`; the panel is a `role="region"` and uses `hidden` when closed.
    Several answers can be open at once.
  - CtaBand.

## 7. Motion and accessibility

- **Reduced motion everywhere:**
  - `MotionConfig reducedMotion="user"` wraps the app.
  - `useMotionSafe` / `usePrefersReducedMotion` skip Motion props.
  - GSAP is **not even loaded** under `prefers-reduced-motion: reduce`, and the particle
    canvas is not rendered.
  - A global CSS rule shortens all CSS transitions and animations.
- **Contrast:** WCAG AA (4.5:1 for text, 3:1 for large text and UI borders).
- **Width:** every page works at **360 px** wide (no horizontal scrolling).
- Keyboard: visible focus rings, a "Skip to content" link, dialogs trap focus and
  close on Escape, form errors are linked with `aria-describedby` and announced.
- Health wording: risk screens always show the backend's disclaimer (docs/risk-engine.md).

## 8. Animation inventory

Rules:

- At most 1-2 *signature* animations per page; everything else is subtle.
- Animate **only transform and opacity**. The gauge number's text also changes.
- Never hide information: labels and values are readable before an animation ends.
- GSAP is a dynamic import on public pages only (there is no Lottie any more).

| What | Where | Library | Kind | Reduced motion |
|---|---|---|---|---|
| **The air clears**: ~56 soft grey PM2.5 particles drift slowly upward on a canvas behind the hero (max 60; the loop pauses when the hero is off screen or the tab is hidden). Scrubbed to scroll through the hero: the particle layer fades out and rises (opacity + translate), the grey haze wash fades, and a brighter mint/sky light fades in | Home hero (`HomeHero`, `components/air/ParticleField.jsx`, `hooks/useAirClearing.js`) | GSAP ScrollTrigger (lazy chunk) + canvas | **signature 1** | no particles, GSAP not loaded, haze hidden, bright layer shown: clear air |
| **Persona switcher**: RiskBadge and explanation crossfade (0.18 s, opacity + small y), SafeHoursBar segment slides (translateX + scaleX), active tab pill glides (layout transform) | Home hero card (`PersonaSwitcher`) | Motion | **signature 2** | instant swaps |
| AQI count-up (0 → value, 0.9 s) + marker rotation, once when visible | `AqiGauge` | Motion | subtle | final value and position at once. The category badge and the screen-reader label always show the final value immediately |
| Air gradient drift: three blurred colour fields move/scale very slowly (28-44 s loops, transform only) | `AirBackground` (hero, page headers, mode cards, Travel preview, auth panel) | CSS keyframes | subtle, decorative | static (global reduced-motion CSS rule) |
| Floating example card (8 px up/down, 7 s loop) | auth side panel (`AuthCard`) | CSS keyframes | subtle | static |
| Route transition (fade + 12 px rise, 0.35 s) | every public page (`PublicLayout`) | Motion | subtle | none |
| Navbar glass fade-in after scrolling | `Navbar` | CSS opacity | subtle | instant |
| Mobile menu open/close (fade + 8 px) | `Navbar` | Motion | subtle | instant |
| Card hover lift (y -2 px) | `Card interactive` (mode cards) | Motion | subtle | none |
| Toasts, modal enter, app page enter (F1) | `Toast`, `Modal`, `AppLayout` | Motion | subtle | none |
| **Feature mini demos** (one signature, six small parts, each driven by `useDemoLoop`: plays when ≥40% on screen, pauses off screen, loops after a short hold) | `/features` cards (`components/features/FeatureDemos.jsx`) | Motion | **signature** (the page's only one) | each shows its final, complete frame |
| ↳ Family risk: three RiskBadges pop in one after another (opacity + scale) | Personalized Family Risk | Motion | part of signature | all three badges shown |
| ↳ Safe hours: the "now" marker glides 7 AM → 9 PM in 1-hour steps (translateX); the text line updates | Safe Hours Timeline (`SafeHoursBar`) | Motion | part of signature | marker at the last step |
| ↳ Why this score: FactorBar fills segment by segment (translateX + scaleX); the legend with % is always visible | Why This Score? (`FactorBar`) | Motion | part of signature | bar full |
| ↳ Alert card slides in (opacity + x) | Smart Alerts | Motion | part of signature | alert shown |
| ↳ Route Delhi → Leh: a dot travels (translateX) while the altitude counts 216 → 3,500 m (motion value, same easing) | Travel Health Plans | Motion | part of signature | 3,500 m, dot at Leh |
| ↳ Privacy: exact pin fades/shrinks while a ~1 km circle grows (scale + opacity); the coordinates text switches to the rounded value | Privacy First | Motion | part of signature | rounded state |
| Packing checklist ticks in one by one (opacity + scale, staggered), once when in view; item names always visible | `/features` Travel preview (`TravelPreview`) | Motion | subtle | all ticked |
| **Agents at work**: scrubbed to scroll, connectors draw (scaleX/scaleY from 0; transform, not SVG stroke drawing), then each node lights up in turn (glow layer opacity + tiny scale). The two parallel agents light up together, then the example alert builds in (card, then its lines). Node titles and explanations are always fully visible; only the "lit" state animates. Desktop (≥ 1024 px): the flow is **pinned** for about 1,300 px of scroll, with a short hold at the end. Mobile: no pin | `/how-it-works` (`components/how/AgentFlow.jsx`, `hooks/useAgentFlow.js`) | GSAP ScrollTrigger + `gsap.matchMedia` (lazy chunks) | **signature** (the page's only one) | GSAP not loaded; the complete flow and alert are shown statically |
| Steps line draws as the row scrolls through (scaleX on desktop, scaleY on mobile; scroll-linked) | `/how-it-works` four steps (`StepsRow`) | Motion `useScroll` | subtle | line fully drawn |
| FactorBar segments fill one after another (0.45 s stagger) when the card is half in view | `/how-it-works` (`WhyScoreExample`) | Motion | subtle | bar full |
| FAQ chevron rotates (CSS transform) | `/how-it-works` FAQ | CSS | subtle | instant |
| **Flip tiles**: a tile turns over (rotateY 0 → 180°, spring) on click, tap, Enter or Space, showing the "What we watch for" chips and a tip; the faces use `backface-visibility: hidden` | `/for-families` (`components/families/FlipTiles.jsx`) | Motion | **signature** (the page's only one) | no 3D: the face switches instantly |
| "Why?" chevron rotates (CSS transform); the reason appears without animation | `/for-families` Same air card | CSS | subtle | instant |
| **CountUp**: the number counts from 0 to its value (1.2 s) once 60% visible; the prefix/suffix and the screen-reader text are final from the start | `/about` impact and product stats (`components/ui/CountUp.jsx`) | Motion (motion value) | subtle | final number at once |

## 9. Logged-in app (F3–F4)

Light theme only. Code: `components/layout/AppLayout.jsx`, `pages/app/`, `pages/DashboardPage.jsx`.
All backend calls go through `services/api.js`; server data uses TanStack Query
(`hooks/useFamily.js`, `hooks/useRisk.js`).

### Layout and routing
- **Desktop (1024 px and up):** a left sidebar.
  - Items: Dashboard, Family, Risk Map, Trips and Alerts, and Settings. Risk Map is a
    placeholder until F5; Trips and Alerts are disabled with a "Soon" tag because the
    backend has no support yet.
  - A user menu at the bottom (Settings, Log out); Escape or a click outside closes it.
- **Topbar:** "Home:" with the rounded coordinates and a Change link
  (`/settings#home-area`). The backend stores no place name, so coordinates are shown.
- **Mobile:** a compact topbar and a bottom tab bar (Dashboard, Family, Map, Settings).
- **Guards:**
  - App routes sit behind `ProtectedRoute requireHome`: logged-out visitors go to
    `/login?next=…`, and users without a home location go to `/onboarding` first.
  - `/onboarding` has its own minimal layout.
- **Lazy loading:** app pages are lazy routes. MapLibre and Recharts are separate lazy
  chunks.

### Onboarding (`/onboarding`)
- **Steps:** Account (done) → Home area → Family (optional, "Skip for now").
- **Home area** (`components/map/LocationPicker.jsx`, also used in Settings):
  - "Use my current location": browser geolocation, requested only on click.
  - Place search: Open-Meteo Geocoding API (`services/geocoding.js`), free with no key,
    data from GeoNames (CC BY 4.0). Debounced 350 ms; searches India first and falls
    back to worldwide. Only the typed text is sent.
  - Clicking the map: MapLibre GL JS with the OpenFreeMap "positron" style (free, no
    key; © OpenStreetMap contributors, © OpenMapTiles). The attribution is always shown.
  - Every point is rounded to 2 decimals (about 1 km) before it is shown or saved, and
    a soft 1 km circle shows the rounding.
  - The time zone is prefilled from the browser (or the chosen place) and is editable.
  - Saved with `PATCH /me {home_lat, home_lon, timezone}`.
- **Map safety** (`components/map/SafeMap.jsx`, `MapFallback.jsx`):
  - The lazy map sits inside an error boundary. A failed chunk load, no WebGL, a base
    map that fails before it loads, or no load within 15 s shows an in-page fallback
    with latitude/longitude inputs. A map problem never crashes the page.
  - MapLibre v6 computes its worker URL at runtime, so `MapView.jsx` imports
    `maplibre-gl-worker.mjs?url` and calls `setWorkerUrl()`.
  - `vite.config.js` pre-bundles `maplibre-gl` for dev (`optimizeDeps.include`).

### Family (`/family`)
- **Cards:** initial avatar, name, age, conditions, and routines as pills. Cards use a
  layout animation when added or removed (none under reduced motion).
- **Add/edit:** a side panel (`ui/Drawer.jsx`: native `<dialog>`, focus trap, Escape;
  a bottom sheet on mobile). It holds the member form plus the routines editor.
- **Conditions:** exactly the codes the risk engine knows: `asthma`, `copd`,
  `heart_disease`, `diabetes`, `pregnancy`. The API accepts any snake_case code, but
  unknown codes would not change the score.
- **Sensitivity mapping:** the backend stores a multiplier from 0.5 to 2.0 (default
  1.0) that scales the whole score (`total = sensitivity × age modifier × raw`).
  - The UI offers five steps: Much lower 0.5 · Lower 0.75 · Typical 1.0 · Higher 1.5 ·
    Much higher 2.0.
  - A stored value between steps (e.g. 1.2, set via the API) is shown on the nearest
    step and is only overwritten if the user changes the control.
- **Routines:**
  - Fields: an activity (common list plus "Other" with free text), a time (local time
    in the user's time zone), and weekday chips. There is no "Outdoor" toggle (no
    backend field).
  - Limits shown: 10 members and 20 routines. Deletes ask for confirmation.

### Settings (`/settings`)
- **Profile:** name and time zone; email read-only.
- **Home area:** a map preview and the same picker.
- **Alerts:** shown disabled with "Coming soon".
- **Download my data:** `GET /me/export`, saved as JSON.
- **Delete account:** requires typing DELETE, then navigates to `/` and logs out.
- **Log out.**

### Dashboard (`/dashboard`) data flow
- **Data used:**
  - `GET /family/risk`: one card per member from one environment snapshot (score,
    level, top factors, missing factors, next safe window, unsafe routine names),
    plus `generated_at`, `timezone`, `data_sources` and `disclaimer`.
  - `GET /members/{first}/risk`: the "Today at home" values (AQI and CPCB category,
    PM2.5, temperature, feels-like, UV, temperature swing) come from
    `assessment.inputs`. They are environment values, identical for every member;
    the family endpoint doesn't return them.
  - `GET /members` for conditions, and `GET /members/{id}/routines` for routine
    times, so unsafe routines can say "Morning walk 6:30 AM is unsafe".
- **Never invented:** any missing value reads "Not available", and missing factors
  are listed.
- **Refresh:**
  - Automatic: when the window regains focus, and every 30 minutes (the backend's
    cache TTL).
  - Manual: a Refresh button with a spinning icon.
  - "Updated X min ago" comes from `generated_at` and updates every minute.
  - The source state is the worst provider state: live / cached / older data (the
    latest update failed).
- **Error and empty states:**
  - 409 (no home): a message and a button to set it.
  - No members: a message and a button to /family.
  - 503: a message with retry.
  - Loading: skeletons.
- **Greeting:** in the user's time zone. Good morning 5–12, Good afternoon 12–17,
  Good evening otherwise.
- **Today's tips** (`lib/tips.js`, labelled "Simple rules based on today's data", no
  AI). Maximum 3, in this order:
  1. Air Poor, Very Poor or Severe → wear an N95 mask outdoors.
  2. The earliest next safe window → "Best time outside: …". If no member has one →
     keep time outdoors short.
  3. heat in any member's top factors → water and shade.
  4. uv → shade, a hat and sunscreen.
  5. cold → warm layers.
  6. temperature_swing → carry an extra layer.

### Member detail (`/dashboard/:memberId`)
- **Data:** `GET /members/{id}/risk` and `GET /members/{id}/risk/hourly`.
- **Header:** score (count-up) and RiskBadge, with "Mainly due to <top factor>".
- **Why this score?:**
  - The FactorBar shows factor shares (`contribution_pct` > 0, with neutral factor
    colours, never the risk palette), linked to rows with input values (AQI with
    AirBadge and PM2.5 basis, feels-like, temperature, swing, UV).
  - Missing factors appear with the reason. Altitude shows as "not applied" at home.
  - A sensitivity box lists the age group (× age modifier), conditions (with their
    multipliers) and the sensitivity setting.
- **Next 24 hours** (`components/dashboard/HourlyChart.jsx`, Recharts, lazy chunk):
  - An area chart of the hourly score over five soft level bands. Each band is named
    on the Y axis (Low … Dangerous), so colour is never the only signal.
  - Safe windows are shaded and also listed as chips above the chart. A dashed
    "Now" line marks the current hour.
  - Hourly scores use each hour's AQI, so they can differ from the current score
    (24-hour mean); the page says so.
  - **Chart accessibility:** the SVG is `aria-hidden`, and a visually hidden `<table>`
    (time, score, level) gives screen readers the same data.
- **Routines:**
  - Each shows its next occurrence and expected level (RiskBadge with score).
  - Unsafe ones are highlighted with a suggestion from the next safe window ("Try
    4:00 PM instead"), or "No safe time in the next 24 hours".
  - `no_forecast` says the time is beyond the forecast.
- **Data sources:** each provider's state and fetch time, with Open-Meteo (CC BY 4.0)
  and OpenAQ attribution, the engine version and the disclaimer.

### Added animations
| What | Where | Library | Reduced motion |
|---|---|---|---|
| Score count-up (0 → score, once when visible) | dashboard cards, member header (`CountUp`) | Motion | final number at once; screen readers always get the final value |
| AQI gauge marker + count-up | Today at home (`AqiGauge`) | Motion | static |
| Live "now" marker moves every minute with a soft ping (scale + opacity) | `SafeHoursBar liveTimezone` (dashboard cards, member detail) | CSS / Motion | no pulse, still updates |
| Refresh icon spins while risk data loads | `RiskStatus` | CSS | not spinning |
| Member cards layout animation on add/remove | `/family` | Motion | none |

### Risk Map (`/map`, F5)
- **Data:**
  - There is no backend endpoint for area conditions or monitoring stations yet. The
    page uses what exists:
    - The rounded home location (`GET /me`).
    - `GET /family/risk` for freshness and data sources.
    - The first member's `GET /members/{id}/risk` `assessment.inputs` for AQI, CPCB
      category, PM2.5 and its basis.
  - A user with no family members therefore sees "add a family member" instead of the
    current air.
  - The station layer is shown **disabled with "Coming soon"**, and the nearest station
    reads "Not available yet". Nothing is made up.
- **Map** (`components/map/RiskMap.jsx`, lazy, behind `MapErrorBoundary`):
  - **Base map and credits:** the OpenFreeMap "positron" style, with attribution for
    the tiles plus "Air quality: Open-Meteo, OpenAQ".
  - **Home area:** a pin and a ~1 km privacy circle tinted with the current CPCB
    **air** category colour (`AQI_CATEGORIES[].hex`; MapLibre paint can't read CSS
    variables). Neutral grey when the category is unknown. Never a person's risk colour.
  - **Controls:** accessible HTML buttons for zoom in, zoom out and "Recenter on home",
    plus a "Show stations" switch (disabled, "Coming soon").
  - MapLibre's CSS sets `.maplibregl-map { position: relative }`, so the map container
    must size itself with `h-full w-full`, not `absolute inset-0`.
- **"Your area" card:** floats over the map on desktop and becomes a bottom sheet below
  the map on mobile. It shows the AirBadge with category and AQI, PM2.5 (with its basis),
  "Updated … ago" and the nearest station (not available yet). The sheet does not
  overlap the map, so the tile attribution stays visible.
- **Legend:** CPCB PM2.5 categories, 24-hour average in µg/m³ (`PM25_BREAKPOINTS` in
  `lib/aqi.js`): Good 0–30, Satisfactory 31–60, Moderate 61–90, Poor 91–120,
  Very Poor 121–250, Severe above 250. A note says station readings will be hourly and
  indicative.
- **Accessibility:** every value on the map is also in the "Your area" card as text.
  The map region has a descriptive label. Controls are real buttons with labels. The
  disabled switch has `aria-disabled` and "(coming soon)" in its name.
- **Fallback:** if the MapLibre chunk fails, there is no WebGL, the base map fails
  before loading, or nothing loads within 15 s, a text card replaces the map with the
  same information (home coordinates, category, AQI, PM2.5) and a reload button.
- **States:** a loading skeleton; 409 or no home → "Set home area" (link to
  `/settings#home-area`); 503 → a message with retry.
- **Signature fly-in:**

| What | Where | Library | Reduced motion |
|---|---|---|---|
| Map glides from India to the home area (`flyTo`, 2.4 s), then the privacy circle expands from 15% to 100% of 1 km and fades in (0.9 s, canvas layer data). Station markers will pop in one after another once the API provides stations | `/map` (`RiskMap`) | MapLibre + requestAnimationFrame | starts on the home view with the full circle; no animation |
