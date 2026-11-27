import { cn } from '../../lib/cn'

/** Mint eyebrow pill ("Features", "AI-Powered Climate Health"). Decorative icon optional. */
export function Pill({ icon: Icon, className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-pill bg-brand-soft px-3.5 py-1.5 text-sm font-semibold text-brand-hover',
        'shadow-[0_6px_16px_-10px_rgb(22_101_52/0.45)] ring-1 ring-mint ring-inset',
        className,
      )}
    >
      {Icon && <Icon aria-hidden="true" size={16} className="text-accent" />}
      {children}
    </span>
  )
}
