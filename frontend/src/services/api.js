/**
 * The ONE place the frontend talks to the backend (docs/frontend.md §2-4).
 *
 * - Every URL is same-origin and starts with /api (Vite proxy in dev, Vercel rewrite
 *   in production). The backend address never appears in browser code.
 * - The access token lives only in this module's memory (never localStorage).
 *   The refresh token is an httpOnly cookie the browser sends to /api/auth/*.
 * - A 401 on an authenticated call triggers ONE refresh, then ONE retry.
 *   Concurrent 401s share the same refresh call (refresh tokens rotate; two
 *   parallel refreshes would look like token theft and revoke the session).
 * - Every failure becomes an ApiError with a message that is safe to show.
 *
 * Shapes below are summaries of backend/app/schemas and backend/app/api.
 * Times are ISO 8601 strings in UTC unless a field says *_local.
 */

const API_BASE = '/api'

let accessToken = null
let refreshPromise = null
let sessionExpiredHandler = null

/** Store or clear the in-memory access token (AuthProvider calls this). */
export function setAccessToken(token) {
  accessToken = token || null
}

export function hasAccessToken() {
  return accessToken !== null
}

/** Called when a refresh fails during a retry, i.e. the session is really over. */
export function onSessionExpired(handler) {
  sessionExpiredHandler = handler
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const ErrorCode = Object.freeze({
  NETWORK: 'network',
  UNAUTHORIZED: 'unauthorized',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  NO_HOME_LOCATION: 'no_home_location',
  VALIDATION: 'validation',
  RATE_LIMITED: 'rate_limited',
  DATA_UNAVAILABLE: 'data_unavailable',
  SERVER: 'server',
})

export class ApiError extends Error {
  /**
   * @param {object} p
   * @param {number} p.status      HTTP status (0 = network failure)
   * @param {string} p.code        one of ErrorCode
   * @param {string} p.message     safe, human-readable message
   * @param {Record<string,string>} [p.fieldErrors] field name -> message (422)
   * @param {string|null} [p.requestId]  X-Request-ID, for support
   * @param {number|null} [p.retryAfter] seconds (429)
   */
  constructor({ status, code, message, fieldErrors = {}, requestId = null, retryAfter = null }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.requestId = requestId
    this.retryAfter = retryAfter
  }
}

const MESSAGES = {
  network: "Can't reach EcoHealth right now. Check your connection and try again.",
  unauthorized: 'Your session has ended. Please log in again.',
  notFound: "We couldn't find that. It may have been deleted.",
  noHome: 'Your home location is not set yet. Add it to see risk scores.',
  validation: 'Please check the highlighted fields.',
  dataUnavailable: 'Environmental data is temporarily unavailable, so no risk score can be shown. Please try again later.',
  server: 'Something went wrong on our side. Please try again in a moment.',
}

// Pydantic prefixes custom messages with "Value error, "; people don't need that.
function cleanMessage(msg) {
  return String(msg || '').replace(/^Value error,\s*/i, '')
}

/** Backend 422 shape: { error, message, details: [{ loc: ['body','field'], msg, type }] } */
function toFieldErrors(details) {
  const fieldErrors = {}
  for (const item of Array.isArray(details) ? details : []) {
    const loc = Array.isArray(item.loc) ? item.loc.filter((p) => p !== 'body') : []
    const field = loc.length ? String(loc[loc.length - 1]) : '_form'
    if (!fieldErrors[field]) fieldErrors[field] = cleanMessage(item.msg)
  }
  return fieldErrors
}

async function toApiError(response) {
  let body
  try {
    body = await response.json()
  } catch {
    body = null // empty or non-JSON body
  }
  const status = response.status
  const requestId = response.headers.get('X-Request-ID')
  const detail = typeof body?.detail === 'string' ? body.detail : null

  if (status === 401) {
    return new ApiError({ status, code: ErrorCode.UNAUTHORIZED, message: detail || MESSAGES.unauthorized, requestId })
  }
  if (status === 404) {
    return new ApiError({ status, code: ErrorCode.NOT_FOUND, message: detail || MESSAGES.notFound, requestId })
  }
  if (status === 409) {
    // Risk APIs return 409 when the user has no home location (backend/app/api/risk.py).
    if (detail && /home location/i.test(detail)) {
      return new ApiError({ status, code: ErrorCode.NO_HOME_LOCATION, message: MESSAGES.noHome, requestId })
    }
    return new ApiError({ status, code: ErrorCode.CONFLICT, message: detail || 'That conflicts with existing data.', requestId })
  }
  if (status === 422) {
    // Either our safe validation handler (details[]) or an HTTPException string (e.g. password policy).
    const fieldErrors = toFieldErrors(body?.details)
    return new ApiError({
      status,
      code: ErrorCode.VALIDATION,
      message: detail ? cleanMessage(detail) : MESSAGES.validation,
      fieldErrors,
      requestId,
    })
  }
  if (status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After')) || null
    const wait = retryAfter ? ` Please wait about ${Math.ceil(retryAfter / 60)} minute(s) and try again.` : ''
    return new ApiError({
      status,
      code: ErrorCode.RATE_LIMITED,
      message: (detail || 'Too many attempts.') + wait,
      retryAfter,
      requestId,
    })
  }
  if (status === 503) {
    return new ApiError({ status, code: ErrorCode.DATA_UNAVAILABLE, message: MESSAGES.dataUnavailable, requestId })
  }
  return new ApiError({ status, code: ErrorCode.SERVER, message: MESSAGES.server, requestId })
}

// ---------------------------------------------------------------------------
// Core request helpers
// ---------------------------------------------------------------------------

async function send(path, { method = 'GET', body, auth = true, signal } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`
  try {
    return await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin', // the refresh cookie (same origin via the /api proxy)
      signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError({ status: 0, code: ErrorCode.NETWORK, message: MESSAGES.network })
  }
}

async function parse(response) {
  if (response.status === 204) return null
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

/**
 * Authenticated JSON request with one refresh-and-retry on 401.
 * `auth: false` is for the /auth/* endpoints themselves (no retry loop).
 */
async function request(path, options = {}) {
  const auth = options.auth !== false
  let response = await send(path, options)

  if (response.status === 401 && auth) {
    try {
      await refreshSession()
    } catch (error) {
      if (error instanceof ApiError && error.code === ErrorCode.UNAUTHORIZED) {
        sessionExpiredHandler?.()
      }
      throw error
    }
    response = await send(path, options)
    if (response.status === 401) {
      setAccessToken(null)
      sessionExpiredHandler?.()
    }
  }

  if (!response.ok) throw await toApiError(response)
  return parse(response)
}

// ---------------------------------------------------------------------------
// Auth  (/auth/*; the refresh cookie has Path=/api/auth and is httpOnly)
// ---------------------------------------------------------------------------

/**
 * POST /auth/refresh  (no body; sends the refresh cookie)
 * -> { access_token, token_type: "bearer", expires_in: seconds }; rotates the cookie.
 * 401 = no/invalid/expired session. Single-flight: concurrent callers share one call.
 * Stores the new access token and resolves to it.
 */
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await send('/auth/refresh', { method: 'POST', auth: false })
      if (!response.ok) {
        setAccessToken(null)
        throw await toApiError(response)
      }
      const data = await parse(response)
      setAccessToken(data.access_token)
      return data.access_token
    })().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

/**
 * POST /auth/register
 * body: { name (1-100), email, password (10-128, not common, not the email),
 *         consent: true, timezone? (IANA, default Asia/Kolkata), home_lat?, home_lon? (together) }
 * -> 201 User: { id, name, email, home_lat, home_lon, timezone, consent_at, created_at, updated_at }
 * 409 = email already registered; 422 = invalid field / password policy.
 * Does NOT log in: call login() afterwards.
 */
export function register(body) {
  return request('/auth/register', { method: 'POST', body, auth: false })
}

/**
 * POST /auth/login   body: { email, password }
 * -> { access_token, token_type, expires_in }; sets the refresh cookie.
 * 401 = wrong email or password (same message either way); 429 = rate limited (Retry-After).
 * Stores the access token.
 */
export async function login({ email, password }) {
  const data = await request('/auth/login', { method: 'POST', body: { email, password }, auth: false })
  setAccessToken(data.access_token)
  return data
}

/**
 * POST /auth/logout  (sends the refresh cookie) -> 204.
 * Revokes the whole refresh-token family and clears the cookie. Always clears the
 * in-memory token, even if the network call fails.
 */
export async function logout() {
  try {
    await request('/auth/logout', { method: 'POST', auth: false })
  } finally {
    setAccessToken(null)
  }
}

// ---------------------------------------------------------------------------
// Account  (/me)
// ---------------------------------------------------------------------------

/**
 * GET /me -> User: { id, name, email, home_lat, home_lon (2 decimals or null),
 *                    timezone, consent_at, created_at, updated_at }
 */
export function getMe() {
  return request('/me')
}

/**
 * PATCH /me  body (all optional): { name, timezone, home_lat + home_lon (together; both null clears) }
 * -> User. Coordinates are rounded by the backend to 2 decimals (~1 km).
 */
export function updateMe(changes) {
  return request('/me', { method: 'PATCH', body: changes })
}

/** DELETE /me -> 204. Deletes the account and ALL its data; clears the refresh cookie. */
export async function deleteMe() {
  await request('/me', { method: 'DELETE' })
  setAccessToken(null)
}

/**
 * GET /me/export -> { exported_at, user: User,
 *   members: [Member & { routines: Routine[] }] }  (no password hash, no tokens)
 */
export function exportMe() {
  return request('/me/export')
}

// ---------------------------------------------------------------------------
// Family members  (/members; max 10 per user; another user's id -> 404)
// ---------------------------------------------------------------------------

/**
 * GET /members -> Member[]:
 *   { id, user_id, name, age (0-120), conditions: string[] (snake_case codes, max 10),
 *     sensitivity (0.5-2.0, default 1.0), created_at, updated_at }
 */
export function listMembers() {
  return request('/members')
}

/** POST /members  body: { name, age, conditions?, sensitivity? } -> 201 Member. 409 = limit reached. */
export function createMember(body) {
  return request('/members', { method: 'POST', body })
}

/** GET /members/{id} -> Member. */
export function getMember(memberId) {
  return request(`/members/${encodeURIComponent(memberId)}`)
}

/** PATCH /members/{id}  body (all optional): { name, age, conditions, sensitivity } -> Member. */
export function updateMember(memberId, changes) {
  return request(`/members/${encodeURIComponent(memberId)}`, { method: 'PATCH', body: changes })
}

/** DELETE /members/{id} -> 204 (also deletes the member's routines). */
export function deleteMember(memberId) {
  return request(`/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// Routines  (/members/{id}/routines; max 20 per member)
// ---------------------------------------------------------------------------

/**
 * GET /members/{id}/routines -> Routine[]:
 *   { id, member_id, activity, start_time "HH:MM:SS" (local time in User.timezone),
 *     days_of_week: ["mon".."sun"], created_at, updated_at }
 */
export function listRoutines(memberId) {
  return request(`/members/${encodeURIComponent(memberId)}/routines`)
}

/** POST /members/{id}/routines  body: { activity, start_time "HH:MM", days_of_week } -> 201 Routine. 409 = limit. */
export function createRoutine(memberId, body) {
  return request(`/members/${encodeURIComponent(memberId)}/routines`, { method: 'POST', body })
}

/** PATCH /members/{id}/routines/{rid}  body (all optional): { activity, start_time, days_of_week } -> Routine. */
export function updateRoutine(memberId, routineId, changes) {
  return request(`/members/${encodeURIComponent(memberId)}/routines/${encodeURIComponent(routineId)}`, {
    method: 'PATCH',
    body: changes,
  })
}

/** DELETE /members/{id}/routines/{rid} -> 204. */
export function deleteRoutine(memberId, routineId) {
  return request(`/members/${encodeURIComponent(memberId)}/routines/${encodeURIComponent(routineId)}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Risk  (docs/risk-engine.md). All responses include `disclaimer`: always show it.
// 409 NO_HOME_LOCATION = home location not set; 503 DATA_UNAVAILABLE = no environmental data.
// Levels: "Low" | "Moderate" | "High" | "Very High" | "Dangerous".
// Factors: "air_quality" | "heat" | "cold" | "temperature_swing" | "uv" | "altitude".
// ---------------------------------------------------------------------------

/**
 * GET /members/{id}/risk -> current risk for one member.
 * { member_id, member_name, disclaimer,
 *   location: { latitude, longitude, grid_degrees } grid-cell centre (~5 km) | null,
 *   assessment: {
 *     engine_version, context: "home", at_time (UTC),
 *     score 0-100, level, top_factors: Factor[],
 *     factors: [{ factor, value, sub_score 0-1, weight, contribution_pct }] (only factors with data),
 *     contributions: { factor: % } (sums to 100 when score > 0),
 *     inputs: { aqi, aqi_category ("Very poor"...), aqi_dominant, aqi_basis ("24h_mean"|"hourly"),
 *               pm2_5, pm10 (µg/m³), temperature_c, relative_humidity_pct, heat_metric_c, heat_basis,
 *               uv_index, temperature_swing_c, elevation_m, weather_basis } (any may be absent),
 *     missing_factors: [{ factor, reason }], not_applied: [{ factor, reason }] (altitude at home),
 *     age_modifier, sensitivity, condition_multipliers: { factor: x }, unknown_conditions,
 *     data_sources: { provider: { source: "live"|"cache"|"stale", fetched_at } },
 *     stale_providers: string[], warnings: string[] } }
 * 404 = not your member; 409 = no home location; 503 = no environmental data.
 */
export function getMemberRisk(memberId) {
  return request(`/members/${encodeURIComponent(memberId)}/risk`)
}

/**
 * GET /members/{id}/risk/hourly -> the next 24 hours for one member.
 * { member_id, member_name, disclaimer, timezone,
 *   hourly: [{ time (UTC hour start), time_local (with offset), score, level, top_factors, missing_factors }],
 *   safe_windows: [{ start, end (UTC, exclusive), start_local, end_local, timezone, hours, worst_level }]
 *     (consecutive hours at Low or Moderate),
 *   routines: [{ activity, start_time "HH:MM:SS", days_of_week, status: "ok"|"unsafe"|"no_forecast",
 *     next_occurrence_local, next_occurrence_utc, score | null, level | null, top_factors }],
 *   warnings: string[] }
 * Hourly scores use hourly AQI, so they can differ from the current score (24-hour mean AQI).
 */
export function getMemberHourlyRisk(memberId) {
  return request(`/members/${encodeURIComponent(memberId)}/risk/hourly`)
}

/**
 * GET /family/risk -> one card per member, all from ONE environment snapshot.
 * { disclaimer, generated_at (UTC), timezone, location (grid-cell centre) | null,
 *   data_sources: { provider: { source: "live"|"cache"|"stale", fetched_at, expires_at } },
 *   warnings: string[],
 *   members: [{ member_id, name, age, score, level, top_factors, missing_factors: Factor[],
 *     next_safe_window: SafeWindow | null, unsafe_routines: string[] (activity names) }] }
 * Not included: environment values (use getMemberRisk(...).assessment.inputs), conditions
 * (use listMembers) and routine times (use listRoutines).
 */
export function getFamilyRisk() {
  return request('/family/risk')
}

// ---------------------------------------------------------------------------
// Trips and Alerts (docs/api-contract-trips-alerts.md, DRAFT contract).
// These endpoints may not exist yet: isNotImplemented(error) tells the UI to switch
// to Preview mode (sample data from lib/previewData.js). Exact field names below are
// the frontend's reading of the draft; keep this block and previewData.js in sync.
// Dates are "YYYY-MM-DD"; timestamps are ISO 8601 UTC.
// ---------------------------------------------------------------------------

/**
 * True when an endpoint is missing on the backend (404 Not Found for an unknown route,
 * or 501 Not Implemented). Only use it on calls that can't 404 for other reasons
 * (list endpoints, /me/alert-settings), never on /trips/{id}.
 */
export function isNotImplemented(error) {
  return error instanceof ApiError && (error.status === 404 || error.status === 501)
}

/**
 * GET /trips -> TripSummary[]:
 *   { id, name, start_date, end_date, stops: [{ place, elevation_m | null }], member_ids: string[] }
 */
export function listTrips() {
  return request('/trips')
}

/**
 * POST /trips  body: { name, trip_type: "work"|"holiday"|"trek"|"pilgrimage"|"beach",
 *   start_date, end_date, member_ids: string[],
 *   stops: [{ place, lat, lon, arrive_date, leave_date }] (in travel order) }
 * -> 201 Trip: { id, name, trip_type, start_date, end_date, member_ids,
 *   stops: [{ place, lat, lon, elevation_m | null, arrive_date, leave_date }] }
 */
export function createTrip(body) {
  return request('/trips', { method: 'POST', body })
}

/** GET /trips/{id} -> Trip (see createTrip). 404 = not your trip. */
export function getTrip(tripId) {
  return request(`/trips/${encodeURIComponent(tripId)}`)
}

/** PATCH /trips/{id}  body: any Trip fields from createTrip -> Trip. */
export function updateTrip(tripId, changes) {
  return request(`/trips/${encodeURIComponent(tripId)}`, { method: 'PATCH', body: changes })
}

/** DELETE /trips/{id} -> 204. */
export function deleteTrip(tripId) {
  return request(`/trips/${encodeURIComponent(tripId)}`, { method: 'DELETE' })
}

/**
 * GET /trips/{id}/plan -> Trip Health Plan:
 *   { trip_id, generated_at, disclaimer,
 *     travellers: [{ member_id, level, score }],
 *     stops: [{ place, elevation_m | null, altitude_gain_m | null, level, key_risks: string[] }],
 *     acclimatisation_notes: string[],
 *     packing_checklist: string[],
 *     warnings: string[],
 *     hospitals: [{ name, distance_km, lat, lon, phone | null }] }
 */
export function getTripPlan(tripId) {
  return request(`/trips/${encodeURIComponent(tripId)}/plan`)
}

/**
 * GET /alerts?type=air|weather|family|travel&cursor=...
 * -> { items: [{ id, created_at, type, level, title, body, member_ids: string[] }], next_cursor: string | null }
 * Newest first. Omit `type` for all types.
 */
export function listAlerts({ type, cursor } = {}) {
  const params = new URLSearchParams()
  if (type) params.set('type', type)
  if (cursor) params.set('cursor', cursor)
  const qs = params.toString()
  return request(`/alerts${qs ? `?${qs}` : ''}`)
}

/** POST /alerts/{id}/feedback  body: { useful: boolean } -> 204 (or 200). */
export function sendAlertFeedback(alertId, useful) {
  return request(`/alerts/${encodeURIComponent(alertId)}/feedback`, { method: 'POST', body: { useful } })
}

/**
 * GET /me/alert-settings -> { daily_brief_email: boolean, browser_push: boolean,
 *   quiet_start: "HH:MM", quiet_end: "HH:MM" } (local times in User.timezone)
 */
export function getAlertSettings() {
  return request('/me/alert-settings')
}

/** PATCH /me/alert-settings  body: any of the fields above -> the full settings. */
export function updateAlertSettings(changes) {
  return request('/me/alert-settings', { method: 'PATCH', body: changes })
}
