import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { axeProblems } from './a11y'

/*
 * One happy path through the real app (local backend + Supabase):
 * register -> onboarding (home area via place search) -> add a member -> add a routine ->
 * dashboard risk card -> member detail -> log out -> protected page redirects to login.
 * Accessibility (axe, WCAG 2.1 AA) is checked on the main pages along the way.
 * The account is always deleted at the end (DELETE /me), even if a step fails.
 */

const RUN = `${Date.now()}-${randomBytes(3).toString('hex')}`
const USER = {
  name: 'E2E Tester',
  email: `e2e-${RUN}@example.com`,
  // Throwaway test password, generated per run (never a real credential).
  password: `E2e-${randomBytes(12).toString('hex')}!`,
}
const MEMBER = { name: 'Nani', age: '72' }

/*
 * HTTP errors that are part of normal operation:
 * - 401 from POST /auth/refresh: the session check on page load when nobody is logged in;
 * - 404 from the Trips/Alerts probe endpoints: the backend doesn't have them yet (Preview mode).
 * Any other 4xx/5xx fails the test.
 */
const EXPECTED_HTTP_ERRORS = [
  [401, /^\/api\/auth\/refresh$/],
  [404, /^\/api\/(trips|alerts|me\/alert-settings)$/],
]
/*
 * Console lines that do not come from our code:
 * - "Failed to load resource": Chrome's own log of the HTTP errors above (checked separately);
 * - "GL Driver Message": headless Chrome's software GPU;
 * - "layers[...].filter": warnings about the third-party OpenFreeMap base-map style.
 */
const IGNORED_CONSOLE = [/^Failed to load resource/, /GL Driver Message/, /^layers\[[\w-]+\]\.filter/]

let accountCreated = false

test.afterAll(async ({ playwright }) => {
  if (!accountCreated) return
  // Same-origin /api through the Vite proxy, like the browser.
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:5173' })
  // Retried: right after a long pause (e.g. the laptop slept) the first request can fail.
  let login
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    login = await api.post('/api/auth/login', { data: { email: USER.email, password: USER.password } }).catch(() => null)
    if (login?.ok()) break
    await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
  }
  const leftover = `Cleanup failed: delete the test account ${USER.email} manually (Settings > Delete account).`
  expect(login?.ok(), `${leftover} Login status: ${login?.status() ?? 'no response'}`).toBeTruthy()
  const { access_token: token } = await login.json()
  const del = await api.delete('/api/me', { headers: { Authorization: `Bearer ${token}` } })
  expect(del.status(), leftover).toBe(204)
  await api.dispose()
})

test('register, set up the family, see risk, log out', async ({ page }) => {
  const a11y = []
  const consoleProblems = []
  page.on('console', (msg) => {
    if (!['error', 'warning'].includes(msg.type())) return
    const text = msg.text()
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return
    consoleProblems.push(`${msg.type()}: ${text}`)
  })
  page.on('pageerror', (err) => consoleProblems.push(`pageerror: ${err.message}`))
  // Every failed HTTP response must be an expected one (see EXPECTED_HTTP_ERRORS).
  page.on('response', (res) => {
    if (res.status() < 400) return
    const path = new URL(res.url()).pathname
    const expected = EXPECTED_HTTP_ERRORS.some(([status, re]) => res.status() === status && re.test(path))
    if (!expected) consoleProblems.push(`http ${res.status()}: ${res.request().method()} ${path}`)
  })

  // ---- Public pages ----
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Stay Healthy')
  a11y.push(...(await axeProblems(page, 'Home')))
  // Keyboard: the first Tab reaches the skip link.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()

  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  a11y.push(...(await axeProblems(page, 'Login')))

  // ---- Register: the auth card flips from Log in to Sign up ----
  // Both sides are in the page; the hidden one is aria-hidden + inert, so scope to the visible side.
  const visibleSide = page.locator('.auth-flip-face:not([aria-hidden="true"])')
  await page.getByRole('link', { name: 'Create an account' }).click()
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeFocused()
  await expect(page).toHaveTitle(/^Create account/)
  a11y.push(...(await axeProblems(page, 'Register')))
  await visibleSide.getByLabel('Name').fill(USER.name)
  await visibleSide.getByLabel('Email').fill(USER.email)
  await visibleSide.getByLabel('Password', { exact: true }).fill(USER.password)
  await visibleSide.getByLabel(/I agree that EcoHealth may store/).check()
  await visibleSide.getByRole('button', { name: /create account/i }).click()
  await expect(page).toHaveURL(/\/onboarding/)
  accountCreated = true

  // ---- Onboarding: home area by place search ----
  await expect(page.getByRole('heading', { name: 'Where is home?' })).toBeVisible()
  await page.getByLabel('Search for your area').fill('New Delhi')
  const results = page.getByRole('list', { name: 'Search results' })
  await results.getByRole('button').first().click()
  await page.getByRole('button', { name: 'Continue' }).click()

  // ---- Onboarding: first family member ----
  await expect(page.getByRole('heading', { name: "Who's in your family?" })).toBeVisible()
  await page.getByLabel('Name').fill(MEMBER.name)
  await page.getByLabel('Age').fill(MEMBER.age)
  await page.getByText('Asthma', { exact: true }).click()
  await page.getByRole('button', { name: 'Add member' }).click()
  await expect(page.getByRole('list', { name: 'Added so far' })).toContainText(MEMBER.name)
  await page.getByRole('button', { name: 'Go to dashboard' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // ---- Family: add a routine ----
  await page.getByRole('navigation', { name: 'App' }).first().getByRole('link', { name: 'Family' }).click()
  await expect(page.getByRole('heading', { name: 'Your family', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: `Edit ${MEMBER.name}` })).toBeVisible()
  a11y.push(...(await axeProblems(page, 'Family')))
  await page.getByRole('button', { name: `Edit ${MEMBER.name}` }).click()
  const panel = page.getByRole('dialog')
  await expect(panel).toBeVisible()
  // Keyboard: focus moves into the side panel (a modal dialog, so the page behind is inert).
  await expect(panel.locator(':focus')).toHaveCount(1)
  await panel.getByRole('button', { name: 'Add routine' }).click()
  await panel.getByLabel('Activity').selectOption({ index: 0 })
  await panel.getByLabel('Time').fill('07:30')
  await panel.getByRole('button', { name: 'Add routine' }).click()
  await expect(panel.getByRole('button', { name: /^Edit routine:/ })).toBeVisible()
  a11y.push(...(await axeProblems(page, 'Family panel')))
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()

  // ---- Dashboard: a risk card ----
  await page.getByRole('navigation', { name: 'App' }).first().getByRole('link', { name: 'Dashboard' }).click()
  const card = page.getByRole('article').filter({ hasText: `${MEMBER.name}, ${MEMBER.age}` })
  await expect(card).toBeVisible({ timeout: 60_000 })
  await expect(card.getByText(/^Risk: (Low|Moderate|High|Very High|Dangerous)$/).first()).toBeVisible()
  await expect(page.getByText(/not medical advice/i).first()).toBeVisible()
  a11y.push(...(await axeProblems(page, 'Dashboard')))

  // ---- Member detail ----
  await card.getByRole('link', { name: /Why this score/ }).click()
  await expect(page).toHaveURL(/\/dashboard\/[\w-]+$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(MEMBER.name)
  await expect(page.getByRole('heading', { name: /why this score/i })).toBeVisible({ timeout: 60_000 })
  a11y.push(...(await axeProblems(page, 'Member detail')))

  // ---- Other app pages (accessibility only) ----
  for (const [path, name, heading] of [
    ['/map', 'Map', 'Risk Map'],
    ['/trips', 'Trips', 'Trips'],
    ['/alerts', 'Alerts', 'Alerts'],
    ['/settings', 'Settings', 'Settings'],
  ]) {
    await page.getByRole('navigation', { name: 'App' }).first().getByRole('link', { name: heading }).click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('.animate-shimmer'), 'loading placeholders gone').toHaveCount(0, { timeout: 30_000 })
    a11y.push(...(await axeProblems(page, name)))
  }

  // ---- Keyboard: the account menu opens with Enter and Escape closes it, returning focus ----
  const menuButton = page.getByRole('button', { name: USER.name })
  await menuButton.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu', { name: 'Account' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu', { name: 'Account' })).toBeHidden()
  await expect(menuButton).toBeFocused()

  // ---- Log out, then a protected page redirects to login ----
  await page.getByRole('button', { name: USER.name }).click()
  await page.getByRole('menuitem', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/family')
  await expect(page).toHaveURL(/\/login\?next=%2Ffamily/)

  // ---- Unknown route: friendly 404 ----
  await page.goto('/this-page-does-not-exist')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await expect(page.getByRole('link', { name: /back to home/i })).toBeVisible()

  expect(a11y, `Accessibility problems (serious/critical):\n${a11y.join('\n')}`).toEqual([])
  expect(consoleProblems, `Browser console errors/warnings:\n${consoleProblems.join('\n')}`).toEqual([])
})
