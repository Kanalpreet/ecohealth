import { CircleAlert } from 'lucide-react'

/** Hint and error text under a form control. The ids are referenced by aria-describedby. */
export function FieldMessages({ hintId, errorId, hint, error }) {
  return (
    <>
      {hint && !error && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-sm font-medium text-danger">
          <CircleAlert aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </>
  )
}
