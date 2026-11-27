import { CircleHelp } from 'lucide-react'
import { cn } from '../../lib/cn'
import { riskLevel } from '../../lib/risk'

/**
 * A PERSON's risk level: Low (green), Moderate (yellow), High (orange),
 * Very High (red), Dangerous (purple). Colour + icon + text label, never colour alone.
 * Never use it for air quality (that is AirBadge). Missing data is "No data", never Low.
 * Optional `score` (0-100) is shown before the label.
 */
export function RiskBadge({ level, score, size = 'md', prefix = 'Risk', className }) {
  const meta = riskLevel(level)
  const Icon = meta ? meta.icon : CircleHelp
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill font-semibold whitespace-nowrap ring-1 ring-inset',
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : size === 'lg' ? 'px-4 py-1.5 text-base' : 'px-3 py-1 text-sm',
        meta ? meta.className : 'bg-subtle text-ink ring-line-strong/40',
        className,
      )}
    >
      <Icon aria-hidden="true" size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16} />
      <span>
        {prefix && <span className="sr-only">{prefix}: </span>}
        {typeof score === 'number' && <span className="tabular-nums">{score} · </span>}
        {meta ? meta.name : 'No data'}
      </span>
    </span>
  )
}
