import { CircleCheck, Info, TriangleAlert, OctagonAlert, ShieldAlert } from 'lucide-react'

/*
 * PERSON risk levels from the backend (LevelName in risk_config.py), lowest first.
 * Used only by RiskBadge / SafeHoursBar, never for air quality (see lib/aqi.js).
 * Each has a distinct icon AND a text label, so colour is never the only signal.
 * Class names are written out in full so Tailwind can find them.
 */
export const RISK_LEVELS = Object.freeze([
  {
    name: 'Low',
    icon: CircleCheck,
    className: 'bg-risk-low text-risk-low-ink ring-risk-low-ink/15',
    solidClass: 'bg-risk-low-solid',
  },
  {
    name: 'Moderate',
    icon: Info,
    className: 'bg-risk-moderate text-risk-moderate-ink ring-risk-moderate-ink/15',
    solidClass: 'bg-risk-moderate-solid',
  },
  {
    name: 'High',
    icon: TriangleAlert,
    className: 'bg-risk-high text-risk-high-ink ring-risk-high-ink/15',
    solidClass: 'bg-risk-high-solid',
  },
  {
    name: 'Very High',
    icon: OctagonAlert,
    className: 'bg-risk-very-high text-risk-very-high-ink ring-risk-very-high-ink/15',
    solidClass: 'bg-risk-very-high-solid',
  },
  {
    name: 'Dangerous',
    icon: ShieldAlert,
    className: 'bg-risk-dangerous text-risk-dangerous-ink ring-risk-dangerous-ink/15',
    solidClass: 'bg-risk-dangerous-solid',
  },
])

export function riskLevel(name) {
  return RISK_LEVELS.find((level) => level.name === name) || null
}
