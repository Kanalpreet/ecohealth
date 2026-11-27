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
    aliases: ['good'],
  },
  {
    name: 'Satisfactory',
    max: 100,
    icon: CircleCheck,
    className: 'bg-aqi-satisfactory text-aqi-satisfactory-ink ring-aqi-satisfactory-ink/15',
    solid: 'var(--color-aqi-satisfactory-solid)',
    aliases: ['satisfactory'],
  },
  {
    name: 'Moderate',
    max: 200,
    icon: Info,
    className: 'bg-aqi-moderate text-aqi-moderate-ink ring-aqi-moderate-ink/15',
    solid: 'var(--color-aqi-moderate-solid)',
    aliases: ['moderate', 'moderately polluted'],
  },
  {
    name: 'Poor',
    max: 300,
    icon: TriangleAlert,
    className: 'bg-aqi-poor text-aqi-poor-ink ring-aqi-poor-ink/15',
    solid: 'var(--color-aqi-poor-solid)',
    aliases: ['poor'],
  },
  {
    name: 'Very Poor',
    max: 400,
    icon: OctagonAlert,
    className: 'bg-aqi-very-poor text-aqi-very-poor-ink ring-aqi-very-poor-ink/15',
    solid: 'var(--color-aqi-very-poor-solid)',
    aliases: ['very poor'],
  },
  {
    name: 'Severe',
    max: 500,
    icon: Skull,
    className: 'bg-aqi-severe text-aqi-severe-ink ring-aqi-severe-ink/15',
    solid: 'var(--color-aqi-severe-solid)',
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
