/*
 * Location helpers. Home coordinates are ALWAYS rounded to 2 decimals (about 1.1 km)
 * in the browser before they are shown, sent or stored, matching the backend
 * (HOME_COORDINATE_DECIMALS = 2). The exact position never leaves this module.
 */
export function round2(value) {
  return Math.round(value * 100) / 100
}

export function roundPoint({ lat, lon }) {
  return { lat: round2(lat), lon: round2(lon) }
}

/** { lat: 28.61, lon: 77.21 } -> "28.61° N, 77.21° E" */
export function formatCoords(point) {
  if (!point || point.lat == null || point.lon == null) return 'Not set'
  const ns = point.lat >= 0 ? 'N' : 'S'
  const ew = point.lon >= 0 ? 'E' : 'W'
  return `${Math.abs(point.lat).toFixed(2)}° ${ns}, ${Math.abs(point.lon).toFixed(2)}° ${ew}`
}

export function userHome(user) {
  if (!user || user.home_lat == null || user.home_lon == null) return null
  return { lat: user.home_lat, lon: user.home_lon }
}

/** GeoJSON polygon approximating a circle of `km` around a point (for the 1 km privacy circle). */
export function circlePolygon({ lat, lon }, km = 1, steps = 64) {
  const coords = []
  const dLat = km / 110.574
  const dLon = km / (111.32 * Math.cos((lat * Math.PI) / 180))
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    coords.push([lon + dLon * Math.cos(t), lat + dLat * Math.sin(t)])
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } }
}

export const INDIA_CENTER = { lat: 22.97, lon: 78.66 }

export function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'
  } catch {
    return 'Asia/Kolkata'
  }
}

/** All IANA zones the browser knows (fallback: a short list). */
export function timezoneOptions(current) {
  let zones
  try {
    zones = Intl.supportedValuesOf('timeZone')
  } catch {
    zones = ['Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York', 'Asia/Dubai', 'Asia/Singapore']
  }
  if (current && !zones.includes(current)) zones = [current, ...zones]
  return zones.map((z) => ({ value: z, label: z.replaceAll('_', ' ') }))
}
