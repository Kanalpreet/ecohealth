import { useEffect, useRef, useState } from 'react'
import { animate, motion, useInView } from 'motion/react'
import { cn } from '../../lib/cn'
import { AQI_CATEGORIES, AQI_MAX, aqiCategoryFor } from '../../lib/aqi'
import { usePrefersReducedMotion } from '../../hooks/useMotionSafe'
import { AirBadge } from './AirBadge'

const CX = 100
const CY = 100
const R = 80
const STROKE = 14

function point(value) {
  const angle = Math.PI * (1 - value / AQI_MAX) // 0 -> left (180 deg), 500 -> right (0 deg)
  return [CX + R * Math.cos(angle), CY - R * Math.sin(angle)]
}

function arc(from, to) {
  const [x1, y1] = point(from)
  const [x2, y2] = point(to)
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

const BANDS = AQI_CATEGORIES.map((c, i) => ({
  ...c,
  from: i === 0 ? 0 : AQI_CATEGORIES[i - 1].max,
  to: Math.min(c.max, AQI_MAX),
}))

/**
 * Semicircle CPCB AQI gauge with the six coloured bands, a rotating marker and an
 * animated count-up (starts when visible). Animates only transform (marker rotation)
 * and the number's text. Reduced motion: final value and marker position at once.
 * The final value is always available to screen readers via the label, and the
 * category badge is shown immediately (never waits for the animation).
 */
export function AqiGauge({ value, className, showBadge = true }) {
  const safeValue = Math.max(0, Math.min(AQI_MAX, Math.round(value)))
  const category = aqiCategoryFor(safeValue)
  const reduce = usePrefersReducedMotion()
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.4 })
  const [shown, setShown] = useState(reduce ? safeValue : 0)
  const animateNow = inView && !reduce

  useEffect(() => {
    if (!animateNow) return undefined
    const controls = animate(0, safeValue, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(Math.round(v)),
    })
    return () => controls.stop()
  }, [animateNow, safeValue])

  const displayed = reduce ? safeValue : shown
  const degrees = (safeValue / AQI_MAX) * 180

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`Air quality index ${safeValue} out of ${AQI_MAX}, ${category ? category.name : 'no data'} (CPCB scale)`}
      className={cn('flex flex-col items-center', className)}
    >
      <div className="relative w-full max-w-[15rem]">
        <svg viewBox="0 0 200 112" className="block w-full" aria-hidden="true">
          {BANDS.map((band) => (
            <path
              key={band.name}
              d={arc(band.from + (band.from === 0 ? 0 : 2), band.to - (band.to === AQI_MAX ? 0 : 2))}
              fill="none"
              stroke={band.solid}
              strokeWidth={STROKE}
              strokeLinecap={band.from === 0 || band.to === AQI_MAX ? 'round' : 'butt'}
              opacity={category && band.name === category.name ? 1 : 0.35}
            />
          ))}
          <motion.g
            initial={false}
            animate={{ rotate: animateNow || reduce ? degrees : 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            style={{ originX: 0.5, originY: 0.5 }}
          >
            {/* Invisible circle centred on the gauge so the group rotates around (100, 100). */}
            <circle cx={CX} cy={CY} r={R + 12} fill="none" stroke="none" />
            <circle cx={CX - R} cy={CY} r={9.5} fill="#ffffff" stroke="var(--color-ink)" strokeWidth={3} />
          </motion.g>
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center leading-none">
          <span className="text-xs font-semibold tracking-wider text-muted uppercase">AQI</span>
          <span className="mt-1 text-5xl font-extrabold tracking-tight text-ink tabular-nums">{displayed}</span>
        </div>
      </div>
      {showBadge && <AirBadge aqi={safeValue} className="mt-3" />}
    </div>
  )
}
