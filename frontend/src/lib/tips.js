import { aqiCategoryNamed } from './aqi'
import { formatWindow } from './riskFormat'

/*
 * "Today's tips": SIMPLE RULES over the API data (no AI, nothing invented).
 * docs/frontend.md lists the rules. At most 3 tips, in this priority order:
 *   1. Air category Poor / Very Poor / Severe        -> N95 mask outdoors
 *   2. Earliest next safe window across the family   -> "Best time outside: ..."
 *      no safe window for anyone (with members)      -> keep outdoor time short
 *   3. heat in any member's top factors              -> water + shade
 *   4. uv in any member's top factors                -> shade, hat, sunscreen
 *   5. cold in any member's top factors              -> warm layers
 *   6. temperature_swing in any top factors          -> carry an extra layer
 * Returns [{ id, text }].
 */
export function buildTips({ inputs, cards = [], timezone }) {
  const tips = []
  const air = aqiCategoryNamed(inputs?.aqi_category)
  if (air && ['Poor', 'Very Poor', 'Severe'].includes(air.name)) {
    tips.push({ id: 'mask', text: `Air quality is ${air.name}: wear an N95 mask outdoors.` })
  }

  const windows = cards
    .map((c) => c.next_safe_window)
    .filter(Boolean)
    .sort((a, b) => new Date(a.start) - new Date(b.start))
  if (windows.length) {
    tips.push({ id: 'window', text: `Best time outside: ${formatWindow(windows[0], timezone)}.` })
  } else if (cards.length) {
    tips.push({ id: 'no-window', text: 'No safe window in the next 24 hours: keep time outdoors short.' })
  }

  const factors = new Set(cards.flatMap((c) => c.top_factors || []))
  if (factors.has('heat')) tips.push({ id: 'heat', text: 'Drink water often and stay in the shade around midday.' })
  if (factors.has('uv')) tips.push({ id: 'uv', text: 'Strong sun: use shade, a hat and sunscreen.' })
  if (factors.has('cold')) tips.push({ id: 'cold', text: 'Dress in warm layers, especially early morning and at night.' })
  if (factors.has('temperature_swing')) tips.push({ id: 'swing', text: 'Big temperature change today: carry an extra layer.' })

  return tips.slice(0, 3)
}
