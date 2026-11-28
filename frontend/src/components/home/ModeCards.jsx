import { Link } from 'react-router'
import { ArrowRight, ArrowUpRight, House, MapPin, Plane } from 'lucide-react'
import { AirBackground } from '../air/AirBackground'
import { Badge } from '../ui/Badge'
import { InteractiveCard } from '../ui/InteractiveCard'
import { RiskBadge } from '../ui/RiskBadge'
import { SectionTitle } from '../ui/SectionTitle'

const FAMILY = [
  { name: 'Priya, 34', detail: 'Asthma', level: 'High' },
  { name: 'Aarav, 6', detail: null, level: 'Moderate' },
  { name: 'Papa, 68', detail: 'Heart', level: 'Very High' },
]

/** Mini preview of a family card (sample data), built from real components. */
function HomePreview() {
  return (
    <div className="glass w-full max-w-xs rounded-card p-4 bg-glass-strong">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-ink">
          <House aria-hidden="true" size={16} className="text-accent" />
          Your family today
        </p>
        <Badge>Example</Badge>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {FAMILY.map((p) => (
          <li key={p.name} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate font-semibold text-ink">
              {p.name}
              {p.detail && <span className="font-normal text-muted"> · {p.detail}</span>}
            </span>
            <RiskBadge level={p.level} size="sm" />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Mini route preview Delhi -> Leh (sample data). */
function TravelPreviewMini() {
  return (
    <div className="glass w-full max-w-xs rounded-card p-4 bg-glass-strong">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-ink">
          <Plane aria-hidden="true" size={16} className="text-accent" />
          Delhi → Leh
        </p>
        <Badge>Example</Badge>
      </div>
      <ol className="mt-4 flex items-start justify-between gap-3 text-sm">
        <li className="flex flex-col">
          <span className="flex items-center gap-1 font-semibold text-ink">
            <MapPin aria-hidden="true" size={14} className="text-accent" /> Delhi
          </span>
          <span className="text-muted tabular-nums">216 m</span>
        </li>
        <li aria-hidden="true" className="mt-2.5 flex-1 border-t-2 border-dashed border-mint-strong" />
        <li className="flex flex-col items-end">
          <span className="flex items-center gap-1 font-semibold text-ink">
            Leh <ArrowUpRight aria-hidden="true" size={14} className="text-accent" />
          </span>
          <span className="font-bold text-ink tabular-nums">3,500 m</span>
        </li>
      </ol>
      <p className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
        Altitude change <RiskBadge level="High" size="sm" />
      </p>
    </div>
  )
}

const MODES = [
  {
    id: 'home',
    title: 'Home Mode',
    text: 'Daily risk for each family member where you live, with the safest hours to go outside and checks on their routines.',
    Preview: HomePreview,
  },
  {
    id: 'travel',
    title: 'Travel Mode',
    text: 'Altitude, weather and air risks for every traveller before a trip, so you can plan rest days and pack the right things.',
    Preview: TravelPreviewMini,
  },
]

/** Home Mode and Travel Mode cards, each with a mini UI preview (no photos). */
export function ModeCards() {
  return (
    <section aria-labelledby="modes-title" className="mx-auto w-full max-w-content px-gutter pt-section sm:px-6">
      <SectionTitle
        id="modes-title"
        title="Protection at home and on the road."
        subtitle="One family profile, two ways to stay ahead of the weather and the air."
      />
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {MODES.map(({ id, title, text, Preview }) => (
          <InteractiveCard
            key={id}
            as="article"
            className="flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition-shadow hover:shadow-raised"
          >
            <div className="relative flex min-h-56 items-center justify-center overflow-hidden px-6 py-8">
              <AirBackground />
              <div className="relative flex w-full justify-center">
                <Preview />
              </div>
            </div>
            <div className="flex flex-1 items-start justify-between gap-4 p-6">
              <div>
                <h3 className="flex flex-wrap items-center gap-2 text-h3 font-bold">
                  {title}
                </h3>
                <p className="mt-2 text-muted">{text}</p>
              </div>
              <Link
                to="/register"
                aria-label={`Get started with ${title}`}
                className="flex size-12 shrink-0 items-center justify-center self-end rounded-pill bg-brand text-white shadow-raised transition-colors hover:bg-brand-hover"
              >
                <ArrowRight aria-hidden="true" size={22} />
              </Link>
            </div>
          </InteractiveCard>
        ))}
      </div>
    </section>
  )
}
