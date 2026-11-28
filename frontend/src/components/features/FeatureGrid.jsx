import { BarChart3, Bell, CalendarClock, Plane, ShieldCheck, Users } from 'lucide-react'
import { InteractiveCard } from '../ui/InteractiveCard'
import { AlertDemo, FactorDemo, FamilyRiskDemo, PrivacyDemo, SafeHoursDemo, TravelDemo } from './FeatureDemos'

const FEATURES = [
  {
    icon: Users,
    title: 'Personalized Family Risk',
    text: 'A score for each family member based on age and health.',
    Demo: FamilyRiskDemo,
  },
  {
    icon: CalendarClock,
    title: 'Safe Hours Timeline',
    text: 'Know the best and worst hours to go outside today.',
    Demo: SafeHoursDemo,
  },
  { icon: BarChart3, title: 'Why This Score?', text: 'See exactly which factors raise your risk.', Demo: FactorDemo },
  { icon: Bell, title: 'Smart Alerts', text: 'Email and browser alerts only when your risk changes.', Demo: AlertDemo },
  {
    icon: Plane,
    title: 'Travel Health Plans',
    text: 'Altitude, weather and packing lists for every trip.',
    Demo: TravelDemo,
  },
  {
    icon: ShieldCheck,
    title: 'Privacy First',
    text: 'Rounded location, no tracking, delete your data anytime.',
    Demo: PrivacyDemo,
  },
]

/** Six feature cards (3x2 desktop, 2 columns tablet, 1 column mobile), each with a mini demo. */
export function FeatureGrid() {
  return (
    <section aria-labelledby="feature-grid-title" className="mx-auto w-full max-w-content px-gutter sm:px-6">
      <h2 id="feature-grid-title" className="sr-only">
        Features
      </h2>
      <p className="mb-6 text-sm text-muted">Each card shows a short example with sample data.</p>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text, Demo }) => (
          <li key={title} className="flex">
            <InteractiveCard as="article" className="glass flex w-full flex-col gap-4 rounded-card p-5 sm:p-6">
              <span className="flex size-12 items-center justify-center rounded-pill bg-brand-soft text-accent ring-1 ring-mint ring-inset">
                <Icon aria-hidden="true" size={22} />
              </span>
              <div>
                <h3 className="text-h3 font-bold">{title}</h3>
                <p className="mt-1 text-muted">{text}</p>
              </div>
              <div className="mt-auto">
                <Demo />
              </div>
            </InteractiveCard>
          </li>
        ))}
      </ul>
    </section>
  )
}
