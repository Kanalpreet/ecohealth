import { Link } from 'react-router'
import { ArrowRight, TriangleAlert } from 'lucide-react'
import { CountUp } from '../ui/CountUp'
import { RiskBadge } from '../ui/RiskBadge'
import { SafeHoursBar } from '../ui/SafeHoursBar'
import { conditionLabel, formatTime, initialOf } from '../../lib/family'
import { factorLabel, formatWindow, windowToSegment } from '../../lib/riskFormat'

/**
 * One member on the dashboard: avatar, name, age, conditions, score (counts up once),
 * RiskBadge, top 2 factors, next safe window (home time zone) with a live "now" marker,
 * and a warning for each unsafe routine. Links to the member detail view.
 */
export function FamilyRiskCard({ card, member, routines = [], timezone }) {
  const segment = windowToSegment(card.next_safe_window, timezone)
  const unsafe = card.unsafe_routines.map((activity) => {
    const times = routines.filter((r) => r.activity === activity).map((r) => formatTime(r.start_time))
    return times.length ? `${activity} ${times.join(', ')}` : activity
  })
  const conditions = member?.conditions || []

  return (
    <article className="flex h-full flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-lg font-extrabold text-brand-hover">
          {initialOf(card.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold text-ink">
            {card.name}, {card.age}
          </h3>
          <p className="truncate text-sm text-muted">{conditions.length ? conditions.map(conditionLabel).join(' · ') : 'No known conditions'}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-4xl font-extrabold tracking-tight text-ink">
          <CountUp value={card.score} />
          <span className="sr-only"> out of 100</span>
        </p>
        <RiskBadge level={card.level} />
      </div>

      {card.top_factors.length > 0 && (
        <ul aria-label="Main factors" className="flex flex-wrap gap-2">
          {card.top_factors.slice(0, 2).map((f) => (
            <li key={f} className="rounded-pill bg-subtle px-3 py-1 text-xs font-semibold text-ink ring-1 ring-line ring-inset">
              {factorLabel(f)}
            </li>
          ))}
        </ul>
      )}
      {card.missing_factors.length > 0 && (
        <p className="text-xs text-muted">Not available: {card.missing_factors.map(factorLabel).join(', ')}</p>
      )}

      <SafeHoursBar
        from={0}
        to={24}
        tickEvery={6}
        safe={segment ? [segment] : []}
        summary={card.next_safe_window ? formatWindow(card.next_safe_window, timezone) : 'no safe window in the next 24 hours'}
        liveTimezone={timezone}
        label="Next safe window"
      />

      {unsafe.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {unsafe.map((text) => (
            <li key={text} className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
              <TriangleAlert aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
              {text} is unsafe
            </li>
          ))}
        </ul>
      )}

      <Link
        to={`/dashboard/${card.member_id}`}
        className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start font-semibold text-accent underline-offset-4 hover:underline"
      >
        Why this score?<span className="sr-only"> ({card.name})</span>
        <ArrowRight aria-hidden="true" size={16} />
      </Link>
    </article>
  )
}
