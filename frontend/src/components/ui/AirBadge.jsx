import { CircleHelp } from 'lucide-react'
import { cn } from '../../lib/cn'
import { aqiCategoryFor, aqiCategoryNamed } from '../../lib/aqi'

/**
 * AIR quality category (CPCB): Good, Satisfactory, Moderate, Poor, Very Poor, Severe.
 * Pass `category` (name, backend names accepted) or `aqi` (number).
 * Colour + icon + text label. Never use it for a person's risk (that is RiskBadge).
 */
export function AirBadge({ category, aqi, size = 'md', prefix = 'Air quality', className }) {
  const meta = category ? aqiCategoryNamed(category) : aqiCategoryFor(aqi)
  const Icon = meta ? meta.icon : CircleHelp
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill font-semibold whitespace-nowrap ring-1 ring-inset',
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        meta ? meta.className : 'bg-subtle text-ink ring-line-strong/40',
        className,
      )}
    >
      <Icon aria-hidden="true" size={size === 'sm' ? 14 : 16} />
      <span>
        {prefix && <span className="sr-only">{prefix}: </span>}
        {meta ? meta.name : 'No data'}
      </span>
    </span>
  )
}
