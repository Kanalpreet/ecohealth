import { ArrowUpFromDot, CalendarHeart, ThermometerSun, Wind } from 'lucide-react'
import { Badge } from '../ui/Badge'

const FEATURES = [
  { icon: Wind, title: 'Air Quality & Pollution', text: 'PM2.5 and PM10 turned into a clear, personal score.' },
  { icon: ThermometerSun, title: 'Heat & Cold Alerts', text: 'Heat, cold and sudden temperature swings, hour by hour.' },
  { icon: ArrowUpFromDot, title: 'Altitude Readiness', text: 'Know how a high-altitude trip may affect each traveller.' },
  // No backend support yet: marked "Soon" so the page never over-promises.
  { icon: CalendarHeart, title: 'Disease Season Watch', text: 'Seasonal climate-health reminders for your region.', soon: true },
]

/** Row of four feature highlights in one glass bar (wraps to 2x2, then 1 column). */
export function FeatureRow() {
  return (
    <section aria-labelledby="feature-row-title" className="relative z-10 mx-auto -mt-14 w-full max-w-content px-gutter sm:px-6">
      <h2 id="feature-row-title" className="sr-only">
        What EcoHealth watches for you
      </h2>
      <ul className="glass grid gap-px overflow-hidden rounded-panel sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, text, soon }) => (
          <li key={title} className="flex items-start gap-4 p-5 sm:p-6">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-pill bg-brand-soft text-accent ring-1 ring-mint ring-inset">
              <Icon aria-hidden="true" size={22} />
            </span>
            <div>
              <h3 className="flex flex-wrap items-center gap-2 font-bold text-ink">
                {title}
                {soon && <Badge>Soon</Badge>}
              </h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
