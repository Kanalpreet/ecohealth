import { useState } from 'react'
import { CircleAlert, RotateCcw } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * Error panel for a failed load. Shows the ApiError's safe message and an optional retry.
 * If `onRetry` returns a promise (e.g. a query's refetch), the retry icon spins until it settles.
 */
export function ErrorState({ title = 'Something did not load', error, onRetry, className }) {
  const [retrying, setRetrying] = useState(false)
  const message = error?.message || 'Please try again.'

  async function retry() {
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }

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
        <button
          type="button"
          onClick={retry}
          disabled={retrying}
          aria-busy={retrying || undefined}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-subtle disabled:cursor-wait disabled:opacity-70"
        >
          <RotateCcw aria-hidden="true" size={18} className={cn(retrying && 'animate-spin [animation-direction:reverse]')} />
          {retrying ? 'Trying again…' : 'Try again'}
        </button>
      )}
    </div>
  )
}
