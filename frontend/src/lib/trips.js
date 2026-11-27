/*
 * Trip helpers: vocabulary, formatting, form validation, and small per-device
 * conveniences kept in localStorage (packing ticks, alerts "last seen"). Those hold no
 * tokens or health data, and every access is wrapped because storage can be blocked.
 */
export const TRIP_TYPES = [
  { value: 'holiday', label: 'Holiday' },
  { value: 'work', label: 'Work' },
  { value: 'trek', label: 'Trek' },
  { value: 'pilgrimage', label: 'Pilgrimage' },
  { value: 'beach', label: 'Beach' },
]

export function tripTypeLabel(value) {
  return TRIP_TYPES.find((t) => t.value === value)?.label || value
}

/** "2027-06-12" -> "12 Jun 2027" (dates are calendar dates: no time zone shift). */
export function formatDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function formatDateRange(start, end) {
  if (!start) return ''
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`
}

export function routeSummary(stops = []) {
  return stops.map((s) => s.place).join(' → ')
}

export function formatElevation(m) {
  return typeof m === 'number' ? `${Math.round(m).toLocaleString('en-US')} m` : 'elevation not available'
}

/**
 * Validates a trip form value. Returns { field: message } (empty when valid).
 * Rules: name 1-100; type chosen; start <= end; at least one traveller and one stop;
 * each stop has a place, arrive <= leave, inside the trip dates, and stops are in order
 * (a stop starts on or after the previous stop's leave date).
 */
export function validateTrip(v) {
  const e = {}
  if (!v.name?.trim()) e.name = 'Give the trip a name.'
  else if (v.name.trim().length > 100) e.name = 'Use at most 100 characters.'
  if (!v.trip_type) e.trip_type = 'Choose a trip type.'
  if (!v.start_date) e.start_date = 'Choose a start date.'
  if (!v.end_date) e.end_date = 'Choose an end date.'
  if (v.start_date && v.end_date && v.end_date < v.start_date) e.end_date = 'The end date must be on or after the start date.'
  if (!v.member_ids?.length) e.member_ids = 'Choose at least one traveller.'
  if (!v.stops?.length) e.stops = 'Add at least one stop.'
  ;(v.stops || []).forEach((s, i) => {
    const label = `Stop ${i + 1}`
    if (!s.arrive_date || !s.leave_date) e[`stop-${i}`] = `${label}: choose arrive and leave dates.`
    else if (s.leave_date < s.arrive_date) e[`stop-${i}`] = `${label}: leave on or after the arrival date.`
    else if ((v.start_date && s.arrive_date < v.start_date) || (v.end_date && s.leave_date > v.end_date))
      e[`stop-${i}`] = `${label}: dates must be within the trip dates.`
    else if (i > 0 && v.stops[i - 1].leave_date && s.arrive_date < v.stops[i - 1].leave_date)
      e[`stop-${i}`] = `${label}: arrives before the previous stop is left. Check the order.`
  })
  return e
}

/** Form value -> POST/PATCH body (contract shape). */
export function toTripBody(v) {
  return {
    name: v.name.trim(),
    trip_type: v.trip_type,
    start_date: v.start_date,
    end_date: v.end_date,
    member_ids: v.member_ids,
    stops: v.stops.map(({ place, lat, lon, arrive_date, leave_date }) => ({ place, lat, lon, arrive_date, leave_date })),
  }
}

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked or full: ticks just won't persist on this device.
  }
}

/** Packing ticks per trip on this device: { [itemText]: true }. */
export function loadChecklist(tripId) {
  return readJson(`ecohealth.trip.${tripId}.checklist`, {})
}
export function saveChecklist(tripId, ticks) {
  writeJson(`ecohealth.trip.${tripId}.checklist`, ticks)
}

/** When the user last opened /alerts on this device (ISO string or null). */
export function loadAlertsSeen() {
  return readJson('ecohealth.alerts.lastSeen', null)
}
export function saveAlertsSeen(iso = new Date().toISOString()) {
  writeJson('ecohealth.alerts.lastSeen', iso)
}
