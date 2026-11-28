import { Clock, ExternalLink, Eye, HandHeart, Info, Layers, Lock, Route, ShieldCheck, UserRound } from 'lucide-react'
import { CtaBand } from '../../components/public/CtaBand'
import { PageHeader } from '../../components/public/PageHeader'
import { CountUp } from '../../components/ui/CountUp'
import { GlassCard } from '../../components/ui/GlassCard'
import { SectionTitle } from '../../components/ui/SectionTitle'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { PAGE_DESCRIPTIONS } from '../../lib/seo'
import { TEAM, initials } from '../../lib/siteConfig'

const linkClass = 'font-semibold text-brand-hover underline decoration-mint-strong underline-offset-4 hover:text-forest'

// Checked against each source (see docs/frontend.md §6). The heatwave number is a
// modelled estimate (the paper calls it a conservative lower bound).
const IMPACT = [
  {
    value: 2,
    suffix: ' million',
    text: 'deaths linked to air pollution in India in 2023',
    source: 'State of Global Air 2025',
    href: 'https://www.stateofglobalair.org/',
  },
  {
    value: 30000,
    prefix: '~',
    text: 'estimated excess deaths linked to a single five-day heatwave in India',
    source: 'Frontiers in Environmental Health, 2026',
    href: 'https://www.frontiersin.org/journals/environmental-health/articles/10.3389/fenvh.2026.1789071/full',
  },
  {
    value: 35,
    suffix: ' million',
    text: 'people with asthma in India',
    source: 'Global Asthma Report 2022',
    href: 'https://globalasthmareport.org/regions/india.php',
  },
]

const PRODUCT = [
  { icon: Clock, value: 24, suffix: '/7', label: 'Hourly monitoring' },
  { icon: Layers, value: 6, label: 'Climate risk factors' },
  { icon: Route, value: 2, label: 'Modes: Home and Travel' },
]

const PRINCIPLES = [
  { icon: ShieldCheck, title: 'Preventive', text: 'Warn before you step outside, not after.' },
  { icon: UserRound, title: 'Personal', text: 'A separate score for each family member.' },
  { icon: Lock, title: 'Private', text: 'Only the data we need, with your location rounded to about 1 km.' },
  { icon: Eye, title: 'Trustworthy', text: 'Fixed, tested rules for scores, and a reason for every one.' },
]

const CREDITS = [
  { name: 'Open-Meteo', note: 'weather and air quality data (CC BY 4.0)', href: 'https://open-meteo.com/' },
  { name: 'OpenAQ', note: 'ground station air quality data', href: 'https://openaq.org/' },
  { name: 'WHO', note: 'air quality and heat-health guidance', href: 'https://www.who.int/' },
  { name: 'CPCB', note: 'National Air Quality Index (India)', href: 'https://cpcb.nic.in/' },
  { name: 'NDMA', note: 'heat wave guidelines (India)', href: 'https://ndma.gov.in/' },
  { name: 'GINA', note: 'Global Initiative for Asthma', href: 'https://ginasthma.org/' },
]

function IconHalo({ icon: Icon }) {
  return (
    <span className="flex size-11 items-center justify-center rounded-pill bg-brand-soft text-accent ring-1 ring-mint ring-inset">
      <Icon aria-hidden="true" size={22} />
    </span>
  )
}

/** /about (F2.4). Motion only (count-ups); no GSAP. */
export function AboutPage() {
  useDocumentTitle('About', PAGE_DESCRIPTIONS.about)
  return (
    <>
      <PageHeader title="About EcoHealth." subtitle="A preventive climate-health platform for you and your family." />

      {/* Why we built it */}
      <section aria-labelledby="why-built" className="mx-auto w-full max-w-content px-gutter sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <h2 id="why-built" className="text-h2 font-extrabold">
              Why we built EcoHealth.
            </h2>
            <p className="mt-4 text-lead text-muted">
              Air pollution and extreme weather affect millions of Indian families every day, but most tools show one
              number for everyone. EcoHealth turns live environmental data into simple, personal precautions, so each
              person in your family knows when it is safest to step outside.
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-3">
            {IMPACT.map((s) => (
              <li key={s.source} className="flex">
                <GlassCard className="flex w-full flex-col gap-2 p-5">
                  <CountUp value={s.value} prefix={s.prefix} suffix={s.suffix} className="text-3xl font-extrabold tracking-tight text-ink" />
                  <p className="text-sm text-ink">{s.text}</p>
                  <p className="mt-auto text-xs text-muted">Source: {s.source}</p>
                </GlassCard>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-6">
          <h3 className="text-sm font-bold text-ink">Sources</h3>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {IMPACT.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  {s.source}
                  <ExternalLink aria-hidden="true" size={13} className="ml-1 inline align-baseline" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* What EcoHealth gives you */}
      <section aria-labelledby="gives-title" className="mx-auto w-full max-w-content px-gutter pt-section sm:px-6">
        <SectionTitle id="gives-title" title="What EcoHealth gives you" />
        <ul className="mt-8 grid gap-6 sm:grid-cols-3">
          {PRODUCT.map((p) => (
            <li key={p.label} className="flex">
              <GlassCard className="flex w-full flex-col gap-3">
                <IconHalo icon={p.icon} />
                <CountUp value={p.value} suffix={p.suffix} className="text-4xl font-extrabold tracking-tight text-ink" />
                <p className="text-muted">{p.label}</p>
              </GlassCard>
            </li>
          ))}
        </ul>
      </section>

      {/* Principles */}
      <section aria-labelledby="principles-title" className="mx-auto w-full max-w-content px-gutter pt-section sm:px-6">
        <SectionTitle id="principles-title" title="Our principles" />
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((p) => (
            <li key={p.title} className="flex">
              <GlassCard className="flex w-full flex-col gap-3">
                <IconHalo icon={p.icon} />
                <h3 className="text-h3 font-bold">{p.title}</h3>
                <p className="text-sm text-muted">{p.text}</p>
              </GlassCard>
            </li>
          ))}
        </ul>
      </section>

      {/* Data and credits */}
      <section aria-labelledby="credits-title" className="mx-auto w-full max-w-content px-gutter pt-section sm:px-6">
        <SectionTitle id="credits-title" title="Data and credits" />
        <GlassCard className="mt-8">
          <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {CREDITS.map((c) => (
              <li key={c.name} className="text-sm text-ink">
                <a href={c.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  {c.name}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>{' '}
                <span className="text-muted">– {c.note}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      </section>

      {/* Team */}
      <section aria-labelledby="team-title" className="mx-auto w-full max-w-content px-gutter pt-section sm:px-6">
        <SectionTitle id="team-title" title="Built as a final-year B.Tech project." />
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:max-w-3xl">
          {TEAM.map((member) => (
            <li key={member.name} className="flex">
              <GlassCard className="flex w-full items-center gap-4">
                <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-extrabold text-white">
                  {initials(member.name)}
                </span>
                <div>
                  <p className="font-bold text-ink">{member.name}</p>
                  <p className="text-sm text-muted">{member.role}</p>
                </div>
              </GlassCard>
            </li>
          ))}
        </ul>
      </section>

      {/* Disclaimer */}
      <section aria-label="Disclaimer" className="mx-auto w-full max-w-content px-gutter pt-section sm:px-6">
        <div className="flex items-start gap-4 rounded-card bg-subtle p-5 ring-1 ring-line ring-inset">
          <Info aria-hidden="true" size={22} className="mt-0.5 shrink-0 text-ink" />
          <p className="text-ink">
            EcoHealth is a risk-awareness tool, not medical advice. Always consult a doctor for health decisions.
          </p>
          <HandHeart aria-hidden="true" size={22} className="ml-auto hidden shrink-0 text-accent sm:block" />
        </div>
      </section>

      <CtaBand />
    </>
  )
}
