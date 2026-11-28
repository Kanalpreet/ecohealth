/*
 * PREVIEW SAMPLE DATA: the ONLY place sample Trips/Alerts data may live
 * (frontend/CLAUDE.md). Shaped exactly like the API in services/api.js
 * (docs/api-contract-trips-alerts.md). Always labelled as sample data (<SampleDataTag> on
 * Trips pages, <PreviewBanner> on Alerts), and only while
 * the backend answers 404/501 for these endpoints. Not real measurements or advice.
 */

// Sample travellers (preview trips can't reference the user's real member ids).
export const PREVIEW_MEMBERS = [
  { id: 'preview-papa', name: 'Papa', age: 68, conditions: ['heart_disease'] },
  { id: 'preview-priya', name: 'Priya', age: 34, conditions: ['asthma'] },
]

const LEH_TRIP = {
  id: 'preview-trip-leh',
  name: 'Trip to Leh',
  trip_type: 'holiday',
  start_date: '2027-06-12',
  end_date: '2027-06-18',
  member_ids: ['preview-papa', 'preview-priya'],
  stops: [
    { place: 'Delhi', lat: 28.61, lon: 77.21, elevation_m: 216, arrive_date: '2027-06-12', leave_date: '2027-06-12' },
    { place: 'Leh', lat: 34.15, lon: 77.58, elevation_m: 3500, arrive_date: '2027-06-12', leave_date: '2027-06-15' },
    { place: 'Pangong Tso', lat: 33.76, lon: 78.67, elevation_m: 4225, arrive_date: '2027-06-15', leave_date: '2027-06-18' },
  ],
}

const GOA_TRIP = {
  id: 'preview-trip-goa',
  name: 'Goa beach week',
  trip_type: 'beach',
  start_date: '2027-12-20',
  end_date: '2027-12-27',
  member_ids: ['preview-priya'],
  stops: [{ place: 'Panaji', lat: 15.49, lon: 73.83, elevation_m: 7, arrive_date: '2027-12-20', leave_date: '2027-12-27' }],
}

export const PREVIEW_TRIPS = [LEH_TRIP, GOA_TRIP]

/** GET /trips shape (summary). */
export function previewTripSummaries() {
  return PREVIEW_TRIPS.map(({ id, name, start_date, end_date, stops, member_ids }) => ({
    id,
    name,
    start_date,
    end_date,
    member_ids,
    stops: stops.map(({ place, elevation_m }) => ({ place, elevation_m })),
  }))
}

export const PREVIEW_PLANS = {
  'preview-trip-leh': {
    trip_id: 'preview-trip-leh',
    generated_at: new Date(Date.now() - 12 * 60_000).toISOString(),
    disclaimer:
      'EcoHealth is a risk-awareness prototype, not a diagnostic tool and not medical advice. In an emergency or if you feel unwell, contact a qualified healthcare professional.',
    travellers: [
      { member_id: 'preview-papa', level: 'High', score: 62 },
      { member_id: 'preview-priya', level: 'Moderate', score: 38 },
    ],
    stops: [
      { place: 'Delhi', elevation_m: 216, altitude_gain_m: null, level: 'Moderate', key_risks: ['Heat'] },
      { place: 'Leh', elevation_m: 3500, altitude_gain_m: 3284, level: 'High', key_risks: ['Altitude', 'Cold nights'] },
      { place: 'Pangong Tso', elevation_m: 4225, altitude_gain_m: 725, level: 'High', key_risks: ['Altitude', 'UV'] },
    ],
    acclimatisation_notes: ['Rest 48 hours in Leh before going higher.'],
    packing_checklist: ['Pulse oximeter', 'Inhaler and spare', 'Warm layers (jacket, gloves, cap)', 'Sunscreen SPF 50', 'ORS sachets'],
    warnings: ["Papa: get a doctor's check-up before travelling."],
    hospitals: [{ name: 'SNM Hospital, Leh', distance_km: 1.2, lat: 34.16, lon: 77.58, phone: null }],
  },
  'preview-trip-goa': {
    trip_id: 'preview-trip-goa',
    generated_at: new Date(Date.now() - 12 * 60_000).toISOString(),
    disclaimer:
      'EcoHealth is a risk-awareness prototype, not a diagnostic tool and not medical advice. In an emergency or if you feel unwell, contact a qualified healthcare professional.',
    travellers: [{ member_id: 'preview-priya', level: 'Low', score: 14 }],
    stops: [{ place: 'Panaji', elevation_m: 7, altitude_gain_m: null, level: 'Low', key_risks: ['UV'] }],
    acclimatisation_notes: [],
    packing_checklist: ['Sunscreen SPF 50', 'Hat', 'Water bottle', 'Inhaler and spare'],
    warnings: [],
    hospitals: [],
  },
}

// Alerts, newest first, relative to "now" so the day grouping looks realistic.
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString()

export const PREVIEW_ALERTS = [
  { id: 'pa-1', created_at: hoursAgo(1), type: 'family', level: 'High', title: 'Daily brief: High risk for Priya and Papa', body: 'AQI 313 (Very Poor) near home. Reduce outdoor activity today.', member_ids: ['preview-priya', 'preview-papa'] },
  { id: 'pa-2', created_at: hoursAgo(5), type: 'air', level: 'Very High', title: 'Air quality worsening tonight', body: 'PM2.5 likely to stay above 120 µg/m³ until morning. Keep windows closed.', member_ids: [] },
  { id: 'pa-3', created_at: hoursAgo(27), type: 'weather', level: 'Moderate', title: 'Temperature to drop by 7 °C', body: 'Cooler conditions tomorrow. Wear warm layers in the morning.', member_ids: [] },
  { id: 'pa-4', created_at: hoursAgo(30), type: 'air', level: 'High', title: 'Poor air in the morning', body: 'Air is worst before 9 AM. The safest window is 3–5 PM.', member_ids: [] },
  { id: 'pa-5', created_at: hoursAgo(52), type: 'travel', level: 'High', title: 'Leh trip reminder', body: 'Rest 48 hours in Leh before going higher to Pangong Tso.', member_ids: ['preview-papa', 'preview-priya'] },
  { id: 'pa-6', created_at: hoursAgo(75), type: 'family', level: 'Moderate', title: "Aarav's cycle to school is unsafe", body: 'Cycle to school at 7:45 AM is during poor air. Try leaving after 9 AM.', member_ids: [] },
  { id: 'pa-7', created_at: hoursAgo(98), type: 'weather', level: 'Low', title: 'Clear skies this weekend', body: 'Low risk for the whole family on Saturday afternoon.', member_ids: [] },
  { id: 'pa-8', created_at: hoursAgo(120), type: 'air', level: 'Moderate', title: 'Air improving', body: 'AQI back to Moderate after the rain.', member_ids: [] },
]

/** GET /alerts shape, with a fake cursor (page size 4) so "Load more" can be tried. */
export function previewAlertsPage({ type, cursor } = {}) {
  const PAGE = 4
  const filtered = PREVIEW_ALERTS.filter((a) => !type || a.type === type)
  const start = cursor ? Number(cursor) : 0
  const items = filtered.slice(start, start + PAGE)
  const next = start + PAGE < filtered.length ? String(start + PAGE) : null
  return { items, next_cursor: next }
}
