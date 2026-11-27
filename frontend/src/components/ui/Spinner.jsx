import { LoaderCircle } from 'lucide-react'
import { cn } from '../../lib/cn'

/** Spinning icon with an accessible label. Under reduced motion the CSS animation is switched off. */
export function Spinner({ label = 'Loading', size = 20, className }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-muted', className)}>
      <LoaderCircle aria-hidden="true" size={size} className="animate-spin" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** Full-area loading state, e.g. while the session is checked on app load. */
export function PageSpinner({ label = 'Loading' }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner label={label} size={28} />
    </div>
  )
}
