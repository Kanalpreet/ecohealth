import { CircleCheck, CircleCheckBig, Info, TriangleAlert, OctagonAlert, Skull } from 'lucide-react'

/*
 * AIR quality categories: India's CPCB National Air Quality Index (0-500).
 * Used only by AirBadge / AqiGauge, never for a person's risk (see lib/risk.js).
 * `aliases` accept the backend's names (risk_config.AQI_CATEGORIES uses
 * "Moderately polluted" and "Very poor").
 */
export const AQI_CATEGORIES = Object.freeze([
  {
    name: 'Good',
    max: 50,
    icon: CircleCheckBig,
    className: 'bg-aqi-good text-aqi-good-ink ring-aqi-good-ink/15',
    solid: 'var(--color-aqi-good-solid)',
    hex: '#059669', // same hue for map layers (MapLibre paint can't read CSS variables)
    aliases: ['good'],
  },
  {
    name: 'Satisfactory',
    max: 100,
    icon: CircleCheck,
    className: 'bg-aqi-satisfactory text-aqi-satisfactory-ink ring-aqi-satisfactory-ink/15',
    solid: 'var(--color-aqi-satisfactory-solid)',
    hex: '#65a30d', // same hue for map layers (MapLibre paint can't read CSS variables)
    aliases: ['satisfactory'],
  },
  {
    name: 'Moderate',
    max: 200,
    icon: Info,
    className: 'bg-aqi-moderate text-aqi-moderate-ink ring-aqi-moderate-ink/15',
    solid: 'var(--color-aqi-moderate-solid)',
    hex: '#ca8a04', // same hue for map layers (MapLibre paint can't read CSS variables)
    aliases: ['moderate', 'moderately polluted'],
  },
  {
    name: 'Poor',
    max: 300,
    icon: TriangleAlert,
    className: 'bg-aqi-poor text-aqi-poor-ink ring-aqi-poor-ink/15',
    solid: 'var(--color-aqi-poor-solid)',
    hex: '#ea580c', // same hue for map layers (MapLibre paint can't read CSS variables)
    aliases: ['poor'],
  },
  {
    name: 'Very Poor',
    max: 400,
    icon: OctagonAlert,
    className: 'bg-aqi-very-poor text-aqi-very-poor-ink ring-aqi-very-poor-ink/15',
    solid: 'var(--color-aqi-very-poor-solid)',
    hex: '#dc2626', // same hue for map layers (MapLibre paint can't read CSS variables)
    aliases: ['very poor'],
  },
  {
    name: 'Severe',
    max: 500,
    icon: Skull,
    className: 'bg-aqi-severe text-aqi-severe-ink ring-aqi-severe-ink/15',
    solid: 'var(--color-aqi-severe-solid)',
    hex: '#7f1d1d', // same hue for map layers (MapLibre paint can't read CSS variables)
    aliases: ['severe'],
  },
])

export const AQI_MAX = 500

/** Category for a numeric CPCB AQI (values above 500 count as Severe). */
export function aqiCategoryFor(value) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) return null
  return AQI_CATEGORIES.find((c) => value <= c.max) || AQI_CATEGORIES[AQI_CATEGORIES.length - 1]
}

/** Category by name ("Poor", "Very poor", "Moderately polluted" ...), case-insensitive. */
export function aqiCategoryNamed(name) {
  if (typeof name !== 'string') return null
  const key = name.trim().toLowerCase()
  return AQI_CATEGORIES.find((c) => c.aliases.includes(key)) || null
}

/*
 * CPCB PM2.5 sub-index breakpoints (24-hour average, µg/m³), used by the map legend
 * and to colour PM2.5 readings. Category names match AQI_CATEGORIES.
 */
export const PM25_BREAKPOINTS = Object.freeze([
  { name: 'Good', range: '0–30', max: 30 },
  { name: 'Satisfactory', range: '31–60', max: 60 },
  { name: 'Moderate', range: '61–90', max: 90 },
  { name: 'Poor', range: '91–120', max: 120 },
  { name: 'Very Poor', range: '121–250', max: 250 },
  { name: 'Severe', range: 'above 250', max: Infinity },
])

/** CPCB category for a PM2.5 value (µg/m³). */
export function pm25Category(value) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) return null
  const bp = PM25_BREAKPOINTS.find((b) => value <= b.max)
  return aqiCategoryNamed(bp.name)
}
