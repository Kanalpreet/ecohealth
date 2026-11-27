/*
 * Formatting for risk API data. Never invents values: anything missing is "Not available".
 * Local times from the API (time_local, start_local, next_occurrence_local) are wall-clock
 * times in the user's home time zone; we read the clock straight from the string so the
 * browser's own time zone never shifts them.
 */
export const NOT_AVAILABLE = 'Not available'

export const FACTOR_LABELS = {
  air_quality: 'Air quality',
  heat: 'Heat',
  cold: 'Cold',
  temperature_swing: 'Temperature swing',
  uv: 'UV',
  altitude: 'Altitude',
}

export function factorLabel(factor) {
  return FACTOR_LABELS[factor] || String(factor).replaceAll('_', ' ')
}

export function hasValue(v) {
  return v !== null && v !== undefined && !(typeof v === 'number' && Number.isNaN(v))
}

/** 167.1 -> "167", with unit; missing -> "Not available". */
export function formatNumber(v, { digits = 0, unit = '' } = {}) {
  if (!hasValue(v)) return NOT_AVAILABLE
  return `${Number(v).toFixed(digits)}${unit}`
}

/** "2026-11-28T06:30:00+05:30" -> { date: "2026-11-28", hour: 6, minute: 30 } */
export function parseLocal(value) {
  if (!value || typeof value !== 'string' || value.length < 16) return null
  return { date: value.slice(0, 10), hour: Number(value.slice(11, 13)), minute: Number(value.slice(14, 16)) }
}

export function clockLabel({ hour, minute }) {
  const suffix = hour < 12 ? 'AM' : 'PM'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return minute ? `${h12}:${String(minute).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`
}

/** "...T06:30..." -> "6:30 AM" */
export function formatLocalTime(value) {
  const p = parseLocal(value)
  return p ? clockLabel(p) : NOT_AVAILABLE
}

/** Today's date "YYYY-MM-DD" in a time zone. */
export function todayIn(timezone, now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

/** Current local clock { hour, minute } in a time zone. */
export function clockIn(timezone, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
    const get = (t) => Number(parts.find((p) => p.type === t)?.value)
    return { hour: get('hour'), minute: get('minute') }
  } catch {
    return { hour: now.getHours(), minute: now.getMinutes() }
  }
}

function dayWord(date, timezone) {
  const today = todayIn(timezone)
  if (date === today) return 'today'
  const tomorrow = todayIn(timezone, new Date(Date.now() + 24 * 3600 * 1000))
  if (date === tomorrow) return 'tomorrow'
  return date
}

/** SafeWindow -> "3:30–5:30 PM today" (in the home time zone). */
export function formatWindow(window, timezone) {
  if (!window) return NOT_AVAILABLE
  const a = parseLocal(window.start_local)
  const b = parseLocal(window.end_local)
  if (!a || !b) return NOT_AVAILABLE
  const start = clockLabel(a)
  const end = clockLabel(b)
  const [sTime, sSuffix] = start.split(' ')
  const [, eSuffix] = end.split(' ')
  const range = sSuffix === eSuffix ? `${sTime}–${end}` : `${start}–${end}`
  return `${range} ${dayWord(a.date, timezone)}`
}

/** SafeWindow -> segment in local hours for SafeHoursBar ({start, end} 0-24, today only). */
export function windowToSegment(window, timezone) {
  const a = parseLocal(window?.start_local)
  const b = parseLocal(window?.end_local)
  if (!a || !b) return null
  if (a.date !== todayIn(timezone)) return null
  const start = a.hour + a.minute / 60
  const end = b.date === a.date ? b.hour + b.minute / 60 : 24
  return { start, end: Math.max(end, start) }
}

/** "Good morning" / "Good afternoon" / "Good evening" in the user's time zone. */
export function greeting(timezone) {
  const { hour } = clockIn(timezone)
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening' // 5 PM to 5 AM ("Good morning" at 1 AM reads oddly)
}

/** "3 min ago", "just now", "2 h ago". */
export function timeAgo(iso, now = Date.now()) {
  if (!iso) return NOT_AVAILABLE
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  return `${h} h ago`
}

const SOURCE_RANK = { live: 0, cache: 1, stale: 2 }
const PROVIDER_LABELS = {
  'open-meteo-weather': 'Weather (Open-Meteo)',
  'open-meteo-air-quality': 'Air quality (Open-Meteo)',
  'open-meteo-elevation': 'Elevation (Open-Meteo)',
  openaq: 'Ground stations (OpenAQ)',
}

export function providerLabel(key) {
  return PROVIDER_LABELS[key] || key
}

/** Worst source state across providers: "live" | "cache" | "stale" | null. */
export function overallSource(dataSources) {
  const states = Object.values(dataSources || {}).map((s) => s?.source).filter(Boolean)
  if (!states.length) return null
  return states.reduce((worst, s) => (SOURCE_RANK[s] > SOURCE_RANK[worst] ? s : worst), 'live')
}

export const SOURCE_TEXT = {
  live: 'Live data',
  cache: 'Recent data (cached)',
  stale: 'Older data: latest update failed',
}

/** API hourly items -> chart points [{ index, label, short, score, level, time }]. */
export function hourlyPoints(hourly = []) {
  return hourly.map((h, index) => {
    const p = parseLocal(h.time_local)
    return { index, label: p ? `${clockLabel(p)}, ${p.date}` : h.time, short: p ? clockLabel(p) : '', score: h.score, level: h.level, time: h.time }
  })
}

/** Safe windows -> index ranges on the hourly points (window end is exclusive). */
export function safeRanges(points, windows = []) {
  return windows
    .map((w) => {
      const start = new Date(w.start).getTime()
      const end = new Date(w.end).getTime()
      const inside = points.filter((p) => {
        const t = new Date(p.time).getTime()
        return t >= start && t < end
      })
      return inside.length ? { from: inside[0].index, to: inside[inside.length - 1].index } : null
    })
    .filter(Boolean)
}

/** Index of the hour containing `now` (or 0 if the forecast starts in the future). */
export function nowIndex(points, now = Date.now()) {
  if (!points.length) return null
  const idx = points.findIndex((p, i) => {
    const t = new Date(p.time).getTime()
    const next = points[i + 1] ? new Date(points[i + 1].time).getTime() : t + 3600_000
    return now >= t && now < next
  })
  if (idx >= 0) return idx
  return now < new Date(points[0].time).getTime() ? 0 : null
}
