import { useId, useState } from 'react'
import { ChevronDown, Users } from 'lucide-react'
import { cn } from '../../lib/cn'
import { PERSONAS, SAMPLE_AQI } from '../home/personas'
import { AirBadge } from '../ui/AirBadge'
import { Badge } from '../ui/Badge'
import { GlassCard } from '../ui/GlassCard'
import { RiskBadge } from '../ui/RiskBadge'

function PersonRow({ person }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-3">
          <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-brand-soft font-bold text-brand-hover">
            {person.name[0]}
          </span>
          <span className="font-semibold text-ink">
            {person.name}, {person.age}
            {person.detail && <span className="font-normal text-muted"> · {person.detail}</span>}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <RiskBadge level={person.level} size="sm" />
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${id}-why`}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex min-h-9 items-center gap-1 rounded-pill px-2.5 text-sm font-semibold text-accent underline-offset-4 hover:underline"
          >
            Why?
            <ChevronDown aria-hidden="true" size={16} className={cn('transition-transform duration-200', open && 'rotate-180')} />
          </button>
        </span>
      </div>
      <p id={`${id}-why`} hidden={!open} className="mt-2 ml-12 text-sm text-muted">
        {person.why}
      </p>
    </li>
  )
}

/** "Same air, different risk": one air reading, three family members (sample data). */
export function SameAirCard() {
  return (
    <section aria-labelledby="same-air-title" className="mx-auto w-full max-w-content px-gutter pt-section sm:px-6">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <h2 id="same-air-title" className="text-h2 font-extrabold">
            Same air, different risk.
          </h2>
          <p className="mt-3 text-lead text-muted">
            One reading for your area, a different score for each person, based on their age and health. Select
            “Why?” to see the reason.
          </p>
        </div>
        <GlassCard as="article" aria-labelledby="same-air-card" className="bg-glass-strong">
          <div className="flex items-center justify-between gap-3">
            <h3 id="same-air-card" className="flex items-center gap-2 font-bold text-ink">
              <Users aria-hidden="true" size={18} className="text-accent" />
              Family risk today
            </h3>
            <Badge>Example</Badge>
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-2 rounded-control bg-subtle p-3 text-sm text-ink">
            Air quality · AQI {SAMPLE_AQI} <AirBadge aqi={SAMPLE_AQI} size="sm" />
          </p>
          <ul className="mt-2 divide-y divide-line">
            {PERSONAS.map((p) => (
              <PersonRow key={p.id} person={{ ...p, detail: p.id === 'papa' ? 'Heart' : p.detail }} />
            ))}
          </ul>
        </GlassCard>
      </div>
    </section>
  )
}
