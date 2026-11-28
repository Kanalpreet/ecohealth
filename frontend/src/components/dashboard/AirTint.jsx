import { createPortal } from 'react-dom'
import { aqiCategoryNamed } from '../../lib/aqi'

/*
 * Very faint page tint by the current CPCB AIR category (never a person's risk).
 * Alphas are tiny on purpose: the canvas stays near-white, so every text/background pair
 * keeps AA contrast (muted text stays above 6:1). It is decoration only: the category is
 * always also shown as text (AirBadge), and this layer is aria-hidden and static.
 */
const TINT = {
  Good: 'rgb(16 185 129 / 0.10)', // hint of green
  Satisfactory: 'rgb(132 204 22 / 0.10)',
  Moderate: 'rgb(234 179 8 / 0.09)',
  Poor: 'rgb(249 115 22 / 0.08)',
  'Very Poor': 'rgb(245 158 11 / 0.11)', // warm amber
  Severe: 'rgb(217 119 6 / 0.12)',
}

/** Rendered into <body> so it sits behind the whole app shell, not just the page column. */
export function AirTint({ category }) {
  const cat = aqiCategoryNamed(category)
  const color = cat ? TINT[cat.name] : null
  if (!color) return null
  return createPortal(
    <div
      aria-hidden="true"
      data-air-tint={cat.name}
      className="pointer-events-none fixed inset-0 -z-10"
      style={{ background: `radial-gradient(80% 60% at 70% 0%, ${color}, transparent 70%), radial-gradient(60% 50% at 0% 100%, ${color}, transparent 70%)` }}
    />,
    document.body,
  )
}
