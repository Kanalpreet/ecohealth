import { CircleAlert, RotateCcw } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from './Button'

/** Error panel for a failed load. Shows the ApiError's safe message and an optional retry. */
export function ErrorState({ title = 'Something did not load', error, onRetry, className }) {
  const message = error?.message || 'Please try again.'
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-3 rounded-card bg-danger-soft px-4 py-8 text-center', className)}
    >
      <CircleAlert aria-hidden="true" size={28} className="text-danger" />
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="max-w-md text-sm text-ink">{message}</p>
      {error?.requestId && <p className="text-xs text-muted">Reference: {error.requestId}</p>}
      {onRetry && (
        <Button variant="secondary" icon={RotateCcw} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
