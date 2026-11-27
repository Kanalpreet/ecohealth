import { CircleHelp } from 'lucide-react'
import { cn } from '../../lib/cn'
import { riskLevel } from '../../lib/risk'

/**
 * Risk level badge: colour + icon + text label, never colour alone.
 * `level` is the backend LevelName ("Low" ... "Dangerous"). Missing data is shown
 * as "No data", never as Low.
 */
export function RiskBadge({ level, size = 'md', prefix = 'Risk', className }) {
  const meta = riskLevel(level)
  const Icon = meta ? meta.icon : CircleHelp
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill font-semibold whitespace-nowrap',
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        meta ? meta.className : 'border border-line-strong bg-subtle text-ink',
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

/** Neutral badge for non-risk labels. */
export function Badge({ className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand-hover',
        className,
      )}
    >
      {children}
    </span>
  )
}
