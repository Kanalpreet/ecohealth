/** aria-describedby value for a control: the error if shown, else the hint. */
export function describedBy({ hint, error, hintId, errorId }) {
  if (error) return errorId
  if (hint) return hintId
  return undefined
}

/** Shared classes for text inputs and selects. */
export const controlClasses =
  'block w-full min-h-11 rounded-control border bg-surface px-3 py-2 text-base text-ink ' +
  'placeholder:text-muted transition-colors focus-visible:outline-none focus-visible:ring-3 ' +
  'focus-visible:ring-focus/40 focus-visible:border-focus disabled:bg-subtle'
