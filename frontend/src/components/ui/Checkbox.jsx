import { useId } from 'react'
import { cn } from '../../lib/cn'
import { describedBy } from '../../lib/field'
import { FieldMessages } from './Field'

/** Checkbox with a label (which may contain links) and an optional hint/error. */
export function Checkbox({ label, hint, error, className, id, ref, ...props }) {
  const autoId = useId()
  const boxId = id || autoId
  const hintId = `${boxId}-hint`
  const errorId = `${boxId}-error`

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-start gap-3">
        <input
          ref={ref}
          id={boxId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy({ hint, error, hintId, errorId })}
          className="mt-0.5 size-5 shrink-0 cursor-pointer accent-brand"
          {...props}
        />
        <label htmlFor={boxId} className="cursor-pointer text-sm text-ink">
          {label}
        </label>
      </div>
      <div className="pl-8">
        <FieldMessages hint={hint} error={error} hintId={hintId} errorId={errorId} />
      </div>
    </div>
  )
}
