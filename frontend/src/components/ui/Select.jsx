import { useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import { controlClasses, describedBy } from '../../lib/field'
import { FieldMessages } from './Field'

/** Labelled native <select>. options: [{ value, label }] */
export function Select({ label, hint, error, options = [], placeholder, className, id, ref, ...props }) {
  const autoId = useId()
  const selectId = id || autoId
  const hintId = `${selectId}-hint`
  const errorId = `${selectId}-error`

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={selectId} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy({ hint, error, hintId, errorId })}
          className={cn(controlClasses, 'appearance-none pr-10', error ? 'border-danger' : 'border-line-strong')}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          size={18}
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
        />
      </div>
      <FieldMessages hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  )
}
