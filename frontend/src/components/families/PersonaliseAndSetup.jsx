import { Link } from 'react-router'
import { ArrowRight, Cake, HeartPulse, MapPin, SlidersHorizontal, UserPlus, Users } from 'lucide-react'
import { GlassCard } from '../ui/GlassCard'
import { SectionTitle } from '../ui/SectionTitle'

// Matches the real engine (risk_config.py): age modifiers, per-condition multipliers,
// and a per-member sensitivity from 0.5 to 2.0.
const PERSONALISE = [
  { icon: Cake, title: 'Age', text: 'Young children and adults over 65 are more sensitive, so their scores get extra weight.' },
  { icon: HeartPulse, title: 'Health conditions', text: 'Each condition reacts to different factors, such as polluted air for asthma or heat for the heart.' },
  { icon: SlidersHorizontal, title: 'Sensitivity', text: 'Fine-tune it for anyone who feels the effects sooner than most.' },
]

const SETUP = [
  { icon: UserPlus, title: 'Create your account', text: 'Name, email and a password.' },
  { icon: MapPin, title: 'Set your home area', text: 'Rounded to about 1 km for privacy.' },
  { icon: Users, title: 'Add family members', text: 'Ages and any health conditions.' },
]

export function PersonaliseAndSetup() {
  return (
    <>
      <section aria-labelledby="personalise-title" className="mx-auto w-full max-w-content px-gutter pt-section sm:px-6">
        <SectionTitle id="personalise-title" title="How we personalise" />
        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          {PERSONALISE.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex">
              <GlassCard className="flex w-full flex-col gap-3">
                <span className="flex size-11 items-center justify-center rounded-pill bg-brand-soft text-accent ring-1 ring-mint ring-inset">
                  <Icon aria-hidden="true" size={22} />
                </span>
                <h3 className="text-h3 font-bold">{title}</h3>
                <p className="text-muted">{text}</p>
              </GlassCard>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="setup-title" className="mx-auto w-full max-w-content px-gutter pt-section sm:px-6">
        <GlassCard className="flex flex-col gap-8 p-6 sm:p-10 lg:flex-row lg:items-center">
          <div className="lg:w-1/3">
            <h2 id="setup-title" className="text-h2 font-extrabold">
              Set up your family in 2 minutes
            </h2>
            <Link
              to="/register"
              className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-pill bg-brand px-6 text-base font-bold text-white shadow-raised transition-colors hover:bg-brand-hover"
            >
              Get started
              <ArrowRight aria-hidden="true" size={20} />
            </Link>
          </div>
          <ol className="grid flex-1 gap-4 sm:grid-cols-3">
            {SETUP.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex gap-3 rounded-card bg-surface/70 p-4 ring-1 ring-line ring-inset">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white">
                  <span className="sr-only">Step </span>
                  {i + 1}
                </span>
                <div>
                  <p className="flex items-center gap-1.5 font-bold text-ink">
                    <Icon aria-hidden="true" size={16} className="text-accent" />
                    {title}
                  </p>
                  <p className="mt-1 text-sm text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </GlassCard>
      </section>
    </>
  )
}
