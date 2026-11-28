import { FlaskConical } from 'lucide-react'
import { cn } from '../../lib/cn'

/** Required on every screen that shows preview sample data (frontend/CLAUDE.md). */
export function PreviewBanner({ feature, className }) {
  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-3 rounded-card bg-risk-moderate p-4 text-sm text-risk-moderate-ink ring-1 ring-risk-moderate-ink/20 ring-inset',
        className,
      )}
    >
      <FlaskConical aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
      <p>
        <span className="font-bold">Preview</span> – {feature} are coming soon. This is sample data.
      </p>
    </div>
  )
}

/**
 * Small, subtle "Sample data" tag placed next to a page title (Trips pages) while the screen
 * shows preview sample data. Keeps the screen honest without a large banner.
 */
export function SampleDataTag({ className }) {
  return (
    <span
      title="This screen shows sample data in this version"
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-subtle px-2.5 py-1 text-xs font-semibold text-muted ring-1 ring-line ring-inset',
        className,
      )}
    >
      <FlaskConical aria-hidden="true" size={13} />
      Sample data
    </span>
  )
}

/**
 * An action that is unavailable in Preview mode. Still focusable (so keyboard and screen
 * reader users learn why), aria-disabled, does nothing when pressed, and shows the reason
 * as a tooltip (title) and in its accessible description.
 */
export function PreviewLockedButton({ children, icon: Icon, reason = 'Not available in this version', className }) {
  return (
    <button
      type="button"
      aria-disabled="true"
      title={reason}
      onClick={(e) => e.preventDefault()}
      className={cn(
        'inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-2 rounded-control px-4 py-2 text-sm font-semibold',
        'bg-subtle text-muted ring-1 ring-line ring-inset',
        className,
      )}
    >
      {Icon && <Icon aria-hidden="true" size={18} />}
      <span>{children}</span>
      <span className="sr-only"> ({reason})</span>
    </button>
  )
}
