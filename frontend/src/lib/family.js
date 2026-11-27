/*
 * Family member and routine vocabulary, matched to the backend.
 *  - CONDITIONS: exactly the codes the risk engine knows (risk_config.CONDITION_MULTIPLIERS,
 *    minus "none", which is represented by an empty list). The API accepts any snake_case
 *    code, but unknown codes would not change the score, so the UI offers only these.
 *  - SENSITIVITY: the backend stores a multiplier 0.5-2.0 (default 1.0) that scales the
 *    whole score (total = sensitivity x age modifier x raw). The UI offers five steps.
 *  - Limits: MAX_MEMBERS_PER_USER = 10, MAX_ROUTINES_PER_MEMBER = 20, name/activity <= 100.
 */
export const LIMITS = Object.freeze({ MEMBERS: 10, ROUTINES: 20, NAME_MAX: 100, ACTIVITY_MAX: 100, AGE_MIN: 0, AGE_MAX: 120 })

export const CONDITIONS = [
  { code: 'asthma', label: 'Asthma' },
  { code: 'copd', label: 'COPD' },
  { code: 'heart_disease', label: 'Heart disease' },
  { code: 'diabetes', label: 'Diabetes' },
  { code: 'pregnancy', label: 'Pregnancy' },
]

export function conditionLabel(code) {
  return CONDITIONS.find((c) => c.code === code)?.label || code.replaceAll('_', ' ')
}

export const SENSITIVITY_STEPS = [
  { value: 0.5, label: 'Much lower', hint: 'Feels effects much later than most (score × 0.5)' },
  { value: 0.75, label: 'Lower', hint: 'Feels effects later than most (score × 0.75)' },
  { value: 1.0, label: 'Typical', hint: 'Default (score × 1.0)' },
  { value: 1.5, label: 'Higher', hint: 'Feels effects sooner than most (score × 1.5)' },
  { value: 2.0, label: 'Much higher', hint: 'Feels effects much sooner than most (score × 2.0)' },
]

/** Closest step to a stored value (values set elsewhere, e.g. 1.2, are shown on the nearest step). */
export function nearestSensitivity(value) {
  const v = typeof value === 'number' ? value : 1
  return SENSITIVITY_STEPS.reduce((best, s) => (Math.abs(s.value - v) < Math.abs(best.value - v) ? s : best)).value
}

export function sensitivityLabel(value) {
  const step = SENSITIVITY_STEPS.find((s) => s.value === nearestSensitivity(value))
  return step ? step.label : 'Typical'
}

export const ACTIVITIES = [
  'Morning walk',
  'Evening walk',
  'Running',
  'Cycling',
  'Outdoor play',
  'School commute',
  'Work commute',
  'Outdoor exercise',
  'Market visit',
  'Temple visit',
]
export const OTHER_ACTIVITY = '__other__'

export const WEEKDAYS = [
  { code: 'mon', short: 'M', label: 'Monday' },
  { code: 'tue', short: 'T', label: 'Tuesday' },
  { code: 'wed', short: 'W', label: 'Wednesday' },
  { code: 'thu', short: 'T', label: 'Thursday' },
  { code: 'fri', short: 'F', label: 'Friday' },
  { code: 'sat', short: 'S', label: 'Saturday' },
  { code: 'sun', short: 'S', label: 'Sunday' },
]

/** ['mon',...,'sun'] -> "Every day"; weekdays -> "Mon–Fri"; ['sat','sun'] -> "Weekends"; else "Mon, Wed". */
export function formatDays(days = []) {
  const set = new Set(days)
  const all = WEEKDAYS.map((d) => d.code)
  if (all.every((d) => set.has(d))) return 'Every day'
  if (set.size === 5 && all.slice(0, 5).every((d) => set.has(d))) return 'Mon–Fri'
  if (set.size === 2 && set.has('sat') && set.has('sun')) return 'Weekends'
  return all
    .filter((d) => set.has(d))
    .map((d) => d[0].toUpperCase() + d.slice(1))
    .join(', ')
}

/** "07:30:00" -> "7:30 AM" (a local time in the user's time zone). */
export function formatTime(value) {
  if (!value) return ''
  const [h, m] = value.split(':').map(Number)
  const suffix = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

/** "07:30:00" -> "07:30" for <input type="time">. */
export function toTimeInput(value) {
  return value ? value.slice(0, 5) : ''
}

export function initialOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase() || '?'
}
