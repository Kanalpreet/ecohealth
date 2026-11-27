import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Clock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRoutineMutations, useRoutines } from '../../hooks/useFamily'
import { useToast } from '../../hooks/useToast'
import { ACTIVITIES, formatDays, formatTime, LIMITS, OTHER_ACTIVITY, toTimeInput, WEEKDAYS } from '../../lib/family'
import { applyServerErrors } from '../../lib/formErrors'
import { routineSchema } from '../../lib/validation'
import { cn } from '../../lib/cn'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { ErrorState } from '../ui/ErrorState'
import { Input } from '../ui/Input'
import { ConfirmDialog } from '../ui/Modal'
import { Select } from '../ui/Select'
import { Skeleton } from '../ui/Skeleton'

const ACTIVITY_OPTIONS = [...ACTIVITIES.map((a) => ({ value: a, label: a })), { value: OTHER_ACTIVITY, label: 'Other…' }]

function RoutineForm({ routine, onSubmit, onCancel }) {
  const [formError, setFormError] = useState(null)
  const known = routine && ACTIVITIES.includes(routine.activity)
  const {
    register,
    control,

    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(routineSchema),
    defaultValues: {
      activityChoice: routine ? (known ? routine.activity : OTHER_ACTIVITY) : ACTIVITIES[0],
      activityOther: routine && !known ? routine.activity : '',
      start_time: toTimeInput(routine?.start_time) || '07:00',
      days_of_week: routine?.days_of_week ?? ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    },
  })
  const choice = useWatch({ control, name: 'activityChoice' })

  async function submit(values) {
    setFormError(null)
    const body = {
      activity: values.activityChoice === OTHER_ACTIVITY ? values.activityOther.trim() : values.activityChoice,
      start_time: values.start_time,
      days_of_week: values.days_of_week,
    }
    try {
      await onSubmit(body)
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['activity', 'start_time', 'days_of_week']))
      if (error?.fieldErrors?.activity) setError('activityOther', { type: 'server', message: error.fieldErrors.activity })
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="flex flex-col gap-4 rounded-card bg-subtle p-4 ring-1 ring-line ring-inset">
      {formError && <Alert>{formError}</Alert>}
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <Select label="Activity" options={ACTIVITY_OPTIONS} error={errors.activityChoice?.message} {...register('activityChoice')} />
        <Input label="Time" type="time" error={errors.start_time?.message} {...register('start_time')} />
      </div>
      {choice === OTHER_ACTIVITY && (
        <Input
          label="Describe the activity"
          maxLength={LIMITS.ACTIVITY_MAX}
          error={errors.activityOther?.message}
          {...register('activityOther')}
        />
      )}
      <Controller
        name="days_of_week"
        control={control}
        render={({ field }) => (
          <fieldset>
            <legend className="text-sm font-semibold text-ink">Days</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const checked = field.value.includes(d.code)
                return (
                  <label
                    key={d.code}
                    title={d.label}
                    className={cn(
                      'flex size-10 cursor-pointer items-center justify-center rounded-full text-sm font-bold ring-1 ring-inset',
                      'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                      checked ? 'bg-brand text-white ring-brand' : 'bg-surface text-ink ring-line-strong/50 hover:bg-subtle',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() =>
                        field.onChange(checked ? field.value.filter((v) => v !== d.code) : [...field.value, d.code])
                      }
                    />
                    <span aria-hidden="true">{d.short}</span>
                    <span className="sr-only">{d.label}</span>
                  </label>
                )
              })}
            </div>
            {errors.days_of_week && <p className="mt-1.5 text-sm font-medium text-danger">{errors.days_of_week.message}</p>}
          </fieldset>
        )}
      />
      <p className="text-xs text-muted">Times are local times in your home time zone.</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {routine ? 'Save routine' : 'Add routine'}
        </Button>
      </div>
    </form>
  )
}

/** Routines of one member inside the member panel: list, add, edit, delete (with confirm). */
export function RoutineEditor({ memberId, memberName }) {
  const { toast } = useToast()
  const routines = useRoutines(memberId)
  const m = useRoutineMutations(memberId)
  const [editing, setEditing] = useState(null) // routine id, 'new' or null
  const [deleting, setDeleting] = useState(null)
  const list = routines.data || []
  const atLimit = list.length >= LIMITS.ROUTINES

  async function confirmDelete() {
    try {
      await m.remove.mutateAsync(deleting.id)
      toast({ tone: 'success', title: 'Routine deleted' })
    } catch (error) {
      toast({ tone: 'error', title: "Couldn't delete the routine", description: error.message })
    } finally {
      setDeleting(null)
    }
  }

  return (
    <section aria-labelledby={`routines-${memberId}`} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id={`routines-${memberId}`} className="font-bold text-ink">
          Routines <span className="font-normal text-muted">({list.length} of {LIMITS.ROUTINES})</span>
        </h3>
        {editing !== 'new' && (
          <Button variant="ghost" icon={Plus} onClick={() => setEditing('new')} disabled={atLimit || routines.isLoading}>
            Add routine
          </Button>
        )}
      </div>
      {atLimit && <p className="text-sm text-muted">This member has the maximum of {LIMITS.ROUTINES} routines.</p>}

      {routines.isLoading && <Skeleton className="h-14 w-full" />}
      {routines.isError && <ErrorState title="Routines didn't load" error={routines.error} onRetry={() => routines.refetch()} />}

      {editing === 'new' && (
        <RoutineForm
          onCancel={() => setEditing(null)}
          onSubmit={async (body) => {
            await m.create.mutateAsync(body)
            setEditing(null)
            toast({ tone: 'success', title: 'Routine added' })
          }}
        />
      )}

      {routines.isSuccess && list.length === 0 && editing !== 'new' && (
        <p className="rounded-card bg-subtle p-4 text-sm text-muted">
          No routines yet. Add things {memberName || 'they'} do outside regularly, like a morning walk, so we can check them against the forecast.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {list.map((r) =>
          editing === r.id ? (
            <li key={r.id}>
              <RoutineForm
                routine={r}
                onCancel={() => setEditing(null)}
                onSubmit={async (body) => {
                  await m.update.mutateAsync({ id: r.id, changes: body })
                  setEditing(null)
                  toast({ tone: 'success', title: 'Routine saved' })
                }}
              />
            </li>
          ) : (
            <li key={r.id} className="flex items-center gap-3 rounded-card bg-surface p-3 ring-1 ring-line ring-inset">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-brand-soft text-accent">
                <Clock aria-hidden="true" size={16} />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-semibold text-ink">{r.activity}</p>
                <p className="text-muted">
                  {formatTime(r.start_time)} · {formatDays(r.days_of_week)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(r.id)}
                className="flex size-10 items-center justify-center rounded-control text-muted hover:bg-subtle hover:text-ink"
                aria-label={`Edit routine: ${r.activity}`}
              >
                <Pencil aria-hidden="true" size={16} />
              </button>
              <button
                type="button"
                onClick={() => setDeleting(r)}
                className="flex size-10 items-center justify-center rounded-control text-muted hover:bg-danger-soft hover:text-danger"
                aria-label={`Delete routine: ${r.activity}`}
              >
                <Trash2 aria-hidden="true" size={16} />
              </button>
            </li>
          ),
        )}
      </ul>

      <ConfirmDialog
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={m.remove.isPending}
        danger
        title="Delete this routine?"
        description={deleting ? `${deleting.activity} at ${formatTime(deleting.start_time)} will be removed.` : ''}
        confirmLabel="Delete routine"
      />
    </section>
  )
}
