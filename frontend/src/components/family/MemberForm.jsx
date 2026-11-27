import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Save } from 'lucide-react'
import { CONDITIONS, LIMITS, nearestSensitivity, SENSITIVITY_STEPS } from '../../lib/family'
import { applyServerErrors } from '../../lib/formErrors'
import { memberSchema } from '../../lib/validation'
import { cn } from '../../lib/cn'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

const FIELDS = ['name', 'age', 'conditions', 'sensitivity']

/**
 * Add / edit a family member: name, age, health conditions (chips) and sensitivity
 * (five steps mapped to the backend's 0.5-2.0 multiplier, see lib/family.js).
 * onSubmit(body) must return a promise; ApiErrors are shown on the fields or above the form.
 * When editing, an untouched sensitivity is not sent, so values set elsewhere (e.g. 1.2) are kept.
 */
export function MemberForm({ member, onSubmit, submitLabel = 'Save member', onCancel }) {
  const editing = Boolean(member)
  const [formError, setFormError] = useState(null)
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      name: member?.name ?? '',
      age: member?.age ?? '',
      conditions: member?.conditions ?? [],
      sensitivity: nearestSensitivity(member?.sensitivity ?? 1),
    },
  })

  async function submit(values) {
    setFormError(null)
    const body = { name: values.name, age: values.age, conditions: values.conditions }
    if (!editing || dirtyFields.sensitivity) body.sensitivity = values.sensitivity
    try {
      await onSubmit(body)
      if (!editing) reset()
    } catch (error) {
      setFormError(applyServerErrors(error, setError, FIELDS))
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="flex flex-col gap-5">
      {formError && <Alert>{formError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <Input label="Name" autoComplete="off" maxLength={LIMITS.NAME_MAX} error={errors.name?.message} {...register('name')} />
        <Input
          label="Age"
          type="number"
          inputMode="numeric"
          min={LIMITS.AGE_MIN}
          max={LIMITS.AGE_MAX}
          error={errors.age?.message}
          {...register('age')}
        />
      </div>

      <Controller
        name="conditions"
        control={control}
        render={({ field }) => (
          <fieldset>
            <legend className="text-sm font-semibold text-ink">
              Health conditions <span className="font-normal text-muted">(select all that apply)</span>
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {CONDITIONS.map((c) => {
                const checked = field.value.includes(c.code)
                return (
                  <label
                    key={c.code}
                    className={cn(
                      'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-pill px-3.5 text-sm font-semibold ring-1 ring-inset transition-colors',
                      'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                      checked ? 'bg-brand-soft text-brand-hover ring-accent' : 'bg-surface text-ink ring-line-strong/50 hover:bg-subtle',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() =>
                        field.onChange(checked ? field.value.filter((v) => v !== c.code) : [...field.value, c.code])
                      }
                    />
                    {checked && <Check aria-hidden="true" size={16} />}
                    {c.label}
                  </label>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-muted">None selected means no known condition.</p>
          </fieldset>
        )}
      />

      <Controller
        name="sensitivity"
        control={control}
        render={({ field }) => {
          const current = SENSITIVITY_STEPS.find((s) => s.value === field.value)
          return (
            <fieldset>
              <legend className="text-sm font-semibold text-ink">Sensitivity</legend>
              <p className="text-xs text-muted">Choose “Higher” for someone who feels the effects of heat or polluted air sooner than most.</p>
              <div className="mt-2 grid grid-cols-5 gap-1 rounded-control bg-subtle p-1 ring-1 ring-line ring-inset">
                {SENSITIVITY_STEPS.map((s) => (
                  <label
                    key={s.value}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center justify-center rounded-control px-1 text-center text-xs font-semibold leading-tight',
                      'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus',
                      field.value === s.value ? 'bg-surface text-brand-hover shadow-card' : 'text-muted hover:text-ink',
                    )}
                  >
                    <input
                      type="radio"
                      name={field.name}
                      className="sr-only"
                      value={s.value}
                      checked={field.value === s.value}
                      onChange={() => field.onChange(s.value)}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
              {current && <p className="mt-1.5 text-xs text-muted">{current.hint}</p>}
            </fieldset>
          )
        }}
      />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" icon={Save} loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
