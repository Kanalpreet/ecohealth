import { useRef } from 'react'
import { Link } from 'react-router'
import { motion, useInView } from 'motion/react'
import { ArrowRight, ArrowUpRight, Check, MapPin, Plane } from 'lucide-react'
import { usePrefersReducedMotion } from '../../hooks/useMotionSafe'
import { AirBackground, GlowCircles } from '../air/AirBackground'
import { Badge } from '../ui/Badge'
import { GlassCard } from '../ui/GlassCard'
import { Pill } from '../ui/Pill'
import { RiskBadge } from '../ui/RiskBadge'

const CHECKLIST = ['Pulse oximeter', 'Inhaler and spare', 'Warm layers', 'Sunscreen SPF 50', 'ORS sachets']

/** Packing list whose ticks appear one by one when in view (items are always readable). */
function PackingList() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })
  const reduce = usePrefersReducedMotion()
  const ticked = reduce || inView
  return (
    <ul ref={ref} className="flex flex-col divide-y divide-line">
      {CHECKLIST.map((item, i) => (
        <li key={item} className="flex items-center gap-3 py-2 text-sm text-ink">
          <span className="relative flex size-5 shrink-0 items-center justify-center rounded-md ring-2 ring-mint-strong ring-inset">
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center rounded-md bg-brand text-white"
              initial={false}
              animate={{ opacity: ticked ? 1 : 0, scale: ticked ? 1 : 0.4 }}
              transition={reduce ? { duration: 0 } : { delay: 0.25 + i * 0.28, type: 'spring', stiffness: 500, damping: 28 }}
            >
              <Check size={14} strokeWidth={3} />
            </motion.span>
          </span>
          {item}
        </li>
      ))}
    </ul>
  )
}

/** Travel Mode preview: copy on the left, an EXAMPLE trip plan over a mountain backdrop on the right. */
export function TravelPreview() {
  return (
    <section
      id="travel-mode"
      aria-labelledby="travel-title"
      className="mx-auto w-full max-w-content scroll-mt-24 px-gutter pt-section sm:px-6"
    >
      <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="flex flex-col items-start gap-4">
          <Pill icon={Plane}>Travel Mode</Pill>
          <h2 id="travel-title" className="text-h2 font-extrabold">
            Going somewhere? We prepare you first.
          </h2>
          <p className="text-lead text-muted">
            Plan a trip and get altitude, weather and health risks for each traveller, with a packing list and nearby
            hospitals.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/register"
              className="inline-flex min-h-12 items-center gap-2 rounded-pill bg-brand px-6 text-base font-bold text-white shadow-raised transition-colors hover:bg-brand-hover"
            >
              Plan a trip
              <ArrowRight aria-hidden="true" size={20} />
            </Link>
            <Badge>Trips are coming soon</Badge>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-panel p-4 sm:p-8">
          {/* Air gradient with soft glowing circles (no photos). */}
          <AirBackground>
            <GlowCircles />
          </AirBackground>

          <GlassCard as="article" aria-labelledby="trip-plan-title" className="relative ml-auto max-w-md bg-glass-strong">
            <div className="flex items-center justify-between gap-3">
              <h3 id="trip-plan-title" className="flex items-center gap-2 font-bold">
                <Plane aria-hidden="true" size={18} className="text-accent" />
                Trip Health Plan
              </h3>
              <Badge>Example</Badge>
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm text-ink">
              <MapPin aria-hidden="true" size={16} className="text-accent" />
              Delhi <ArrowRight aria-label="to" size={14} /> Leh · June
            </p>

            <div className="mt-4 rounded-control bg-risk-high/60 p-3 ring-1 ring-risk-high-ink/15 ring-inset">
              <div className="flex flex-wrap items-center gap-2">
                <ArrowUpRight aria-hidden="true" size={18} className="text-risk-high-ink" />
                <span className="font-semibold text-ink">Altitude 3,500 m</span>
                <RiskBadge level="High" size="sm" />
              </div>
              <p className="mt-1 text-sm text-ink">Rest 48 hours in Leh before going higher.</p>
            </div>

            <h4 className="mt-5 text-sm font-bold text-ink">Packing checklist</h4>
            <PackingList />
          </GlassCard>
        </div>
      </div>
    </section>
  )
}
