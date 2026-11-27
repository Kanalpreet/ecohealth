import { useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '../../lib/cn'
import { usePrefersReducedMotion } from '../../hooks/useMotionSafe'
import { RiskBadge } from '../ui/RiskBadge'
import { SafeHoursBar } from '../ui/SafeHoursBar'
import { PERSONAS, SAMPLE_NOW } from './personas'

const SWAP = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.18, ease: 'easeOut' },
}

/**
 * Signature animation 2 on Home: same air, different person. Accessible tabs
 * (ARIA tabs pattern: arrow keys, Home/End, roving tabindex). Switching smoothly swaps
 * the RiskBadge and explanation (fast crossfade) and slides the SafeHoursBar segment
 * (transform only). Reduced motion: instant swaps.
 */
export function PersonaSwitcher() {
  const [active, setActive] = useState(0)
  const tabRefs = useRef([])
  const baseId = useId()
  const reduce = usePrefersReducedMotion()
  const person = PERSONAS[active]
  const swap = reduce ? { initial: false } : SWAP

  function select(index) {
    const next = (index + PERSONAS.length) % PERSONAS.length
    setActive(next)
    tabRefs.current[next]?.focus()
  }

  function onKeyDown(event) {
    const keys = { ArrowRight: active + 1, ArrowDown: active + 1, ArrowLeft: active - 1, ArrowUp: active - 1, Home: 0, End: PERSONAS.length - 1 }
    if (event.key in keys) {
      event.preventDefault()
      select(keys[event.key])
    }
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Example family members"
        onKeyDown={onKeyDown}
        className="grid grid-cols-3 gap-1 rounded-pill bg-subtle p-1 ring-1 ring-line ring-inset"
      >
        {PERSONAS.map((p, i) => {
          const selected = i === active
          return (
            <button
              key={p.id}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${p.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={cn(
                'relative min-h-11 rounded-pill px-2 text-sm font-semibold transition-colors',
                selected ? 'text-brand-hover' : 'text-muted hover:text-ink',
              )}
            >
              {selected && (
                <motion.span
                  layoutId={reduce ? undefined : `${baseId}-tab-bg`}
                  className="absolute inset-0 rounded-pill bg-surface shadow-card"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
              <span className="relative">{p.name}</span>
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${person.id}`}
        tabIndex={0}
        className="mt-4 flex flex-col gap-4 rounded-card focus-visible:outline-offset-4"
      >
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
          <p className="font-bold text-ink">
            {person.name}, {person.age}
            {person.detail && <span className="font-medium text-muted"> · {person.detail}</span>}
          </p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={person.id} {...swap}>
              <RiskBadge level={person.level} />
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="min-h-[3rem]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={person.id} className="text-sm text-muted" {...swap}>
              {person.why}
            </motion.p>
          </AnimatePresence>
        </div>

        <SafeHoursBar safe={person.safe} now={SAMPLE_NOW} />
      </div>
    </div>
  )
}
