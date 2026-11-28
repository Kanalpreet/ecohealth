import { useRef } from 'react'
import { useInView } from 'motion/react'
import { HeartPulse, Snowflake, Sun, Thermometer, ThermometerSun, Wind } from 'lucide-react'
import { usePrefersReducedMotion } from '../../hooks/useMotionSafe'
import { AirBadge } from '../ui/AirBadge'
import { Badge } from '../ui/Badge'
import { FactorBar } from '../ui/FactorBar'
import { GlassCard } from '../ui/GlassCard'
import { RiskBadge } from '../ui/RiskBadge'
import { SectionTitle } from '../ui/SectionTitle'

/*
 * SAMPLE numbers, consistent with the real engine: score 66 is "Very High" (60-79),
 * AQI 313 is CPCB "Very Poor" (301-400), UV 2 is "low" (WHO; < 3 adds nothing), so
 * only air quality and temperature swing contribute.
 */
const FACTORS = [
  { id: 'air', name: 'Air quality', share: 93, className: 'bg-risk-very-high-solid' },
  { id: 'swing', name: 'Temperature swing', share: 7, className: 'bg-risk-high-solid' },
]

const ROWS = [
  {
    id: 'air',
    factorId: 'air',
    icon: Wind,
    label: 'Air quality',
    value: (
      <>
        AQI 313 <AirBadge category="Very Poor" size="sm" className="ml-1 align-middle" />{' '}
        <span className="text-muted">(PM2.5 137 µg/m³, 24-hour average)</span>
      </>
    ),
  },
  { id: 'swing', factorId: 'swing', icon: Thermometer, label: 'Temperature swing', value: '11 °C change in 24 h' },
  { id: 'heat', icon: ThermometerSun, label: 'Heat', value: 'none' },
  { id: 'cold', icon: Snowflake, label: 'Cold', value: 'none' },
  { id: 'uv', icon: Sun, label: 'UV', value: 'index 2, low' },
]

export function WhyScoreExample() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })
  const reduce = usePrefersReducedMotion()
  const revealed = reduce || inView ? FACTORS.length : 0

  return (
    <section aria-labelledby="why-title" className="mx-auto w-full max-w-content px-gutter pt-section sm:px-6">
      <div className="grid items-start gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <SectionTitle
          id="why-title"
          title="Why this score?"
          subtitle="Every score comes with its reasons: which factors raise it, by how much, and what makes each person more sensitive. Hover or focus a part of the bar to see its row."
        />

        <GlassCard as="article" aria-labelledby="why-card-title" className="bg-glass-strong">
          <div className="flex items-center justify-between gap-3">
            <h3 id="why-card-title" className="font-bold text-ink">
              Priya, 34 · Asthma
            </h3>
            <Badge>Example</Badge>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <p className="text-5xl font-extrabold tracking-tight text-ink tabular-nums">
              66<span className="sr-only"> out of 100</span>
            </p>
            <div className="flex flex-col items-start gap-1.5">
              <RiskBadge level="Very High" size="lg" />
              <p className="text-sm text-muted">Mainly due to poor air quality.</p>
            </div>
          </div>

          <div ref={ref} className="mt-6">
            <FactorBar factors={FACTORS} rows={ROWS} revealed={revealed} stagger={0.45} />
          </div>

          <p className="mt-4 flex items-center gap-2 rounded-control bg-brand-soft p-3 text-sm text-ink">
            <HeartPulse aria-hidden="true" size={18} className="shrink-0 text-accent" />
            <span>
              <span className="font-semibold">What makes Priya more sensitive:</span> Asthma
            </span>
          </p>
        </GlassCard>
      </div>
    </section>
  )
}
