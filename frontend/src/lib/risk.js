import { CircleCheck, Info, TriangleAlert, OctagonAlert, ShieldAlert } from 'lucide-react'

/*
 * Risk levels from the backend (LevelName in risk_config.py), lowest first.
 * Each has a distinct icon AND a text label, so colour is never the only signal.
 * Class names are written out in full so Tailwind can find them.
 */
export const RISK_LEVELS = Object.freeze([
  { name: 'Low', icon: CircleCheck, className: 'bg-risk-low text-risk-low-ink' },
  { name: 'Moderate', icon: Info, className: 'bg-risk-moderate text-risk-moderate-ink' },
  { name: 'High', icon: TriangleAlert, className: 'bg-risk-high text-risk-high-ink' },
  { name: 'Very High', icon: OctagonAlert, className: 'bg-risk-very-high text-risk-very-high-ink' },
  { name: 'Dangerous', icon: ShieldAlert, className: 'bg-risk-dangerous text-risk-dangerous-ink' },
])

export function riskLevel(name) {
  return RISK_LEVELS.find((level) => level.name === name) || null
}
