import { Clock, Pencil } from 'lucide-react'
import { conditionLabel, formatDays, formatTime, initialOf, nearestSensitivity, sensitivityLabel } from '../../lib/family'
import { Skeleton } from '../ui/Skeleton'

/** One family member: initial avatar, name, age, conditions, routines as pills, Edit. */
export function MemberCard({ member, routinesQuery, onEdit }) {
  const routines = routinesQuery?.data || []
  const sensitivity = nearestSensitivity(member.sensitivity)
  return (
    <article className="flex h-full flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-lg font-extrabold text-brand-hover">
          {initialOf(member.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold text-ink">
            {member.name}, <span className="font-semibold">{member.age}</span>
          </h3>
          <p className="text-sm text-muted">
            {member.conditions.length ? member.conditions.map(conditionLabel).join(' · ') : 'No known conditions'}
            {sensitivity !== 1 && <> · Sensitivity: {sensitivityLabel(member.sensitivity)}</>}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="flex size-11 shrink-0 items-center justify-center rounded-control text-muted ring-1 ring-line hover:bg-subtle hover:text-ink"
          aria-label={`Edit ${member.name}`}
        >
          <Pencil aria-hidden="true" size={16} />
        </button>
      </div>

      <div className="border-t border-line pt-3">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Routines ({routines.length})</p>
        {routinesQuery?.isLoading ? (
          <Skeleton className="mt-2 h-8 w-2/3" />
        ) : routinesQuery?.isError ? (
          <p className="mt-2 text-sm text-danger">Routines didn't load.</p>
        ) : routines.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No routines yet.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {routines.map((r) => (
              <li key={r.id} className="inline-flex items-center gap-1.5 rounded-pill bg-subtle px-3 py-1 text-xs font-semibold text-ink ring-1 ring-line ring-inset">
                <Clock aria-hidden="true" size={12} className="text-accent" />
                {r.activity} · {formatTime(r.start_time)} · {formatDays(r.days_of_week)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}
