import { useEffect, useRef } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react'
import { ArrowRight, ArrowUpRight, Bell, Mail, MapPin, Monitor } from 'lucide-react'
import { useDemoLoop } from '../../hooks/useDemoLoop'
import { formatHour } from '../../lib/time'
import { FactorBar } from '../ui/FactorBar'
import { RiskBadge } from '../ui/RiskBadge'
import { SafeHoursBar } from '../ui/SafeHoursBar'

/*
 * Mini demos for the six Features cards. All data is SAMPLE data.
 * Each demo: plays when its card is on screen (useDemoLoop), pauses off screen,
 * and shows its final, complete state under reduced motion. Only transform and
 * opacity animate. The visual is aria-hidden; an sr-only sentence states what it shows.
 */

const POP = {
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.85 },
  transition: { type: 'spring', stiffness: 420, damping: 26 },
}
const NO_MOTION = { initial: false, transition: { duration: 0 } }

function DemoFrame({ children, description }) {
  return (
    <div className="rounded-card bg-surface/75 p-4 ring-1 ring-line ring-inset">
      <p className="sr-only">{description}</p>
      <div aria-hidden="true">{children}</div>
    </div>
  )
}

// 1. Same air, different people: badges appear one after another.
const FAMILY = [
  { name: 'Priya, 34', detail: 'Asthma', level: 'High' },
  { name: 'Aarav, 6', detail: null, level: 'Moderate' },
  { name: 'Papa, 68', detail: 'Heart', level: 'Very High' },
]

export function FamilyRiskDemo() {
  const ref = useRef(null)
  const { step, reduce } = useDemoLoop(ref, { steps: FAMILY.length + 1, interval: 750, hold: 4 })
  const pop = reduce ? NO_MOTION : POP
  return (
    <div ref={ref}>
      <DemoFrame description="Example: for the same air, Priya (34, asthma) is High, Aarav (6) is Moderate and Papa (68, heart condition) is Very High.">
        <ul className="flex flex-col gap-2">
          {FAMILY.map((p, i) => (
            <li key={p.name} className="flex min-h-8 items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-ink">
                {p.name}
                {p.detail && <span className="font-normal text-muted"> · {p.detail}</span>}
              </span>
              <span className="flex min-w-[6.5rem] justify-end">
                <AnimatePresence initial={false}>
                  {step > i && (
                    <motion.span key="badge" {...pop}>
                      <RiskBadge level={p.level} size="sm" prefix={null} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </li>
          ))}
        </ul>
      </DemoFrame>
    </div>
  )
}

// 2. The "now" marker glides along the day.
const NOW_START = 7
const NOW_STEPS = 15 // 7 AM ... 9 PM

export function SafeHoursDemo() {
  const ref = useRef(null)
  const { step } = useDemoLoop(ref, { steps: NOW_STEPS, interval: 650, hold: 3 })
  const now = NOW_START + step
  const safe = now >= 14 && now < 17
  return (
    <div ref={ref}>
      <DemoFrame description="Example timeline: safe to go outside from 2 to 5 PM; a marker shows the current time moving through the day.">
        <SafeHoursBar safe={[{ start: 14, end: 17 }]} now={now} from={6} to={22} tickEvery={4} />
        <p className="mt-2 text-xs font-semibold text-ink">
          {formatHour(now)}: {safe ? 'inside the safe window' : 'outside the safe window'}
        </p>
      </DemoFrame>
    </div>
  )
}

// 3. Factor bar filling segment by segment.
const FACTORS = [
  { name: 'Air quality', share: 72, className: 'bg-brand' },
  { name: 'Heat', share: 18, className: 'bg-risk-high-solid' },
  { name: 'UV', share: 10, className: 'bg-risk-moderate-solid' },
]

export function FactorDemo() {
  const ref = useRef(null)
  const { step } = useDemoLoop(ref, { steps: FACTORS.length + 1, interval: 700, hold: 4 })
  return (
    <div ref={ref}>
      <DemoFrame description="Example score breakdown: air quality 72%, heat 18%, UV 10%.">
        <p className="mb-2 text-xs font-semibold text-muted">What raises this score</p>
        <FactorBar factors={FACTORS} revealed={step} />
      </DemoFrame>
    </div>
  )
}

// 4. An alert card slides in.
export function AlertDemo() {
  const ref = useRef(null)
  const { step, reduce } = useDemoLoop(ref, { steps: 2, interval: 900, hold: 4 })
  const slide = reduce
    ? NO_MOTION
    : {
        initial: { opacity: 0, x: 28 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -16 },
        transition: { type: 'spring', stiffness: 300, damping: 28 },
      }
  return (
    <div ref={ref}>
      <DemoFrame description="Example alert: risk changed from Moderate to High for Papa, sent by email and browser notification.">
        <div className="min-h-[5.75rem]">
          <AnimatePresence initial={false}>
            {step >= 1 && (
              <motion.div key="alert" className="flex gap-3 rounded-control bg-surface p-3 shadow-card ring-1 ring-line" {...slide}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-brand-soft text-accent">
                  <Bell size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">Risk changed for Papa</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5">
                    <RiskBadge level="Moderate" size="sm" prefix={null} />
                    <ArrowRight size={14} className="text-muted" />
                    <RiskBadge level="High" size="sm" prefix={null} />
                  </p>
                  <p className="mt-1.5 flex items-center gap-3 text-[0.7rem] text-muted">
                    <span className="flex items-center gap-1">
                      <Mail size={12} /> Email
                    </span>
                    <span className="flex items-center gap-1">
                      <Monitor size={12} /> Browser
                    </span>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DemoFrame>
    </div>
  )
}

// 5. Delhi -> Leh with the altitude counting up.
const FROM_M = 216
const TO_M = 3500

export function TravelDemo() {
  const ref = useRef(null)
  const { step, reduce } = useDemoLoop(ref, { steps: 2, interval: 1000, hold: 3 })
  const altitude = useMotionValue(reduce ? TO_M : FROM_M)
  const shown = useTransform(altitude, (v) => `${Math.round(v).toLocaleString('en-US')} m`)
  const arrived = step === 1

  useEffect(() => {
    const target = arrived ? TO_M : FROM_M
    if (reduce) {
      altitude.set(target)
      return undefined
    }
    // Same duration and easing as the travelling dot, so number and dot arrive together.
    const controls = animate(altitude, target, { duration: arrived ? 1.6 : 0.4, ease: 'easeInOut' })
    return () => controls.stop()
  }, [arrived, reduce, altitude])

  return (
    <div ref={ref}>
      <DemoFrame description="Example trip: Delhi at 216 metres to Leh at 3,500 metres.">
        <div className="flex items-center justify-between text-xs font-semibold text-ink">
          <span className="flex items-center gap-1">
            <MapPin size={14} className="text-accent" /> Delhi
          </span>
          <span className="flex items-center gap-1">
            Leh <ArrowUpRight size={14} className="text-accent" />
          </span>
        </div>
        <div className="relative my-3 h-3">
          <div className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-mint-strong" />
          <motion.div
            className="absolute inset-y-0 left-0 w-full"
            initial={false}
            animate={{ x: arrived ? '100%' : '0%' }}
            transition={reduce ? { duration: 0 } : { duration: arrived ? 1.6 : 0.4, ease: 'easeInOut' }}
          >
            <span className="absolute top-0 left-0 size-3 -translate-x-1/2 rounded-full bg-brand ring-2 ring-surface" />
          </motion.div>
        </div>
        <p className="text-sm text-muted">
          Altitude <motion.span className="text-lg font-extrabold text-ink tabular-nums">{shown}</motion.span>
        </p>
      </DemoFrame>
    </div>
  )
}

// 6. A precise pin softens into a ~1 km circle.
export function PrivacyDemo() {
  const ref = useRef(null)
  const { step, reduce } = useDemoLoop(ref, { steps: 2, interval: 1100, hold: 4 })
  const rounded = step === 1
  const t = reduce ? { duration: 0 } : { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
  return (
    <div ref={ref}>
      <DemoFrame description="Example: an exact location 28.61394, 77.20902 is stored rounded to 28.61, 77.21, an area of about 1 kilometre.">
        <div className="flex items-center gap-4">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-control bg-[linear-gradient(135deg,#eef6f1_25%,#e3efe8_25%,#e3efe8_50%,#eef6f1_50%,#eef6f1_75%,#e3efe8_75%)] bg-[length:16px_16px]">
            <motion.span
              className="absolute inset-2 rounded-full border-2 border-accent bg-mint/70"
              initial={false}
              animate={{ scale: rounded ? 1 : 0.15, opacity: rounded ? 1 : 0 }}
              transition={t}
            />
            <motion.span
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full text-forest"
              initial={false}
              animate={{ opacity: rounded ? 0.35 : 1, scale: rounded ? 0.8 : 1 }}
              transition={t}
            >
              <MapPin size={24} fill="currentColor" stroke="#ffffff" strokeWidth={1.5} />
            </motion.span>
          </div>
          <div className="min-w-0 text-xs">
            <p className="text-muted">{rounded ? 'Stored as' : 'Exact point'}</p>
            <p className="font-mono text-sm font-semibold text-ink tabular-nums">
              {rounded ? '28.61, 77.21' : '28.61394, 77.20902'}
            </p>
            <p className="mt-1 text-muted">{rounded ? 'about a 1 km area' : 'never stored'}</p>
          </div>
        </div>
      </DemoFrame>
    </div>
  )
}
