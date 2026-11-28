import { useId, useState } from 'react'
import { BookOpenCheck, Calculator, ChevronDown, ShieldCheck, Stethoscope } from 'lucide-react'
import { cn } from '../../lib/cn'
import { GlassCard } from '../ui/GlassCard'
import { SectionTitle } from '../ui/SectionTitle'

const TRUST = [
  { icon: Calculator, title: 'Scores from fixed rules, not guesses', text: 'The score is calculated by tested code. No AI decides your risk level.' },
  { icon: BookOpenCheck, title: 'Advice grounded in health guidelines', text: 'Precautions draw on published guidance from WHO, CPCB and NDMA.' },
  { icon: ShieldCheck, title: 'A safety check on every message', text: 'The Safety reviewer checks each message before it reaches you.' },
  { icon: Stethoscope, title: 'Not medical advice', text: 'EcoHealth raises awareness. Always consult a doctor for health decisions.' },
]

const FAQ = [
  {
    q: 'Is this medical advice?',
    a: 'No. EcoHealth is a climate-health risk-awareness tool, not a diagnostic tool and not medical advice. Scores are estimates from environmental data and simple, tested rules. If you feel unwell or have questions about a health condition, contact a qualified healthcare professional.',
  },
  {
    q: 'Where does the air quality data come from?',
    a: 'Air quality and weather come from Open-Meteo (licensed CC BY 4.0). Where ground monitoring stations are nearby, their readings come from OpenAQ. Every reading is marked as live, recently cached or stale, so you always know how fresh it is.',
  },
  {
    q: "What do you do with my family's data?",
    a: "We collect only what's needed to estimate risk: names, ages, the health conditions you choose to add and daily routines. Your home location is rounded to about 1 km. You can export or delete all of your data at any time.",
  },
  {
    q: 'Does it work outside Delhi?',
    a: 'Yes. EcoHealth works anywhere in India with air quality and weather data coverage. Ground stations are not everywhere; where there are none, modelled air quality data is used.',
  },
]

/** Accessible accordion (button + aria-expanded/aria-controls; several can be open). */
function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <li className="glass rounded-card">
      <h3>
        <button
          type="button"
          id={`${id}-q`}
          aria-expanded={open}
          aria-controls={`${id}-a`}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-14 w-full items-center justify-between gap-4 rounded-card px-5 py-4 text-left font-bold text-ink hover:bg-surface/60"
        >
          {q}
          <ChevronDown
            aria-hidden="true"
            size={20}
            className={cn('shrink-0 text-accent transition-transform duration-200', open && 'rotate-180')}
          />
        </button>
      </h3>
      <div id={`${id}-a`} role="region" aria-labelledby={`${id}-q`} hidden={!open} className="px-5 pb-5 text-muted">
        {a}
      </div>
    </li>
  )
}

export function TrustAndFaq() {
  return (
    <>
      <section aria-labelledby="trust-title" className="mx-auto w-full max-w-content px-gutter pt-section sm:px-6">
        <SectionTitle id="trust-title" title="Built to be trusted" />
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex">
              <GlassCard className="flex w-full flex-col gap-3">
                <span className="flex size-11 items-center justify-center rounded-pill bg-brand-soft text-accent ring-1 ring-mint ring-inset">
                  <Icon aria-hidden="true" size={22} />
                </span>
                <h3 className="font-bold text-ink">{title}</h3>
                <p className="text-sm text-muted">{text}</p>
              </GlassCard>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="faq-title" className="mx-auto w-full max-w-3xl px-gutter pt-section sm:px-6">
        <SectionTitle id="faq-title" title="Questions, answered" align="center" />
        <ul className="mt-8 flex flex-col gap-3">
          {FAQ.map((item) => (
            <FaqItem key={item.q} {...item} />
          ))}
        </ul>
      </section>
    </>
  )
}
