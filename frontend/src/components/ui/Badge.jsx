import { cn } from '../../lib/cn'

/**
 * Neutral badge for non-risk labels ("Example", "Soon").
 * For risk use RiskBadge (people) or AirBadge (air quality): never this one.
 */
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
