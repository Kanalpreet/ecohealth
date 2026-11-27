/*
 * Place search via the Open-Meteo Geocoding API (free, no key; data: GeoNames, CC BY 4.0).
 * This is a THIRD-PARTY call (not our backend), so it lives here rather than in api.js.
 * Only the typed search text is sent; never the user's coordinates.
 * Results are limited to India first; if India has no match, a worldwide search runs.
 */
const BASE = 'https://geocoding-api.open-meteo.com/v1/search'

async function query(name, { countryCode, signal }) {
  const params = new URLSearchParams({ name, count: '8', language: 'en', format: 'json' })
  if (countryCode) params.set('countryCode', countryCode)
  const response = await fetch(`${BASE}?${params}`, { signal })
  if (!response.ok) throw new Error('Place search is unavailable right now. Try again, or pick a point on the map.')
  const data = await response.json()
  return (data.results || []).map((r) => ({
    id: r.id,
    name: r.name,
    region: [r.admin2, r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
    timezone: r.timezone || null,
    elevation_m: typeof r.elevation === 'number' ? r.elevation : null,
  }))
}

/**
 * searchPlaces('Saket') -> [{ id, name, region, lat, lon, timezone, elevation_m }]
 * Queries shorter than 2 characters return [] without a request.
 */
export async function searchPlaces(text, { signal } = {}) {
  const name = text.trim()
  if (name.length < 2) return []
  try {
    const india = await query(name, { countryCode: 'IN', signal })
    if (india.length) return india
    return await query(name, { signal })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new Error(error?.message?.startsWith('Place search') ? error.message : "Can't reach the place search right now.", { cause: error })
  }
}
