import { CalendarCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '../../lib/cn'
import { formatHour, formatHourRange } from '../../lib/time'
import { usePrefersReducedMotion } from '../../hooks/useMotionSafe'
import { useNow } from '../../hooks/useRisk'
import { clockIn, clockLabel } from '../../lib/riskFormat'

/**
 * Time axis with "safe to go outside" segments and an optional "now" marker.
 *   from / to : axis range in local clock hours (default 6 AM - 10 PM)
 *   safe      : [{ start: 14, end: 17 }, ...] in local hours
 *   now       : optional fixed local hour for the marker (demos), OR
 *   liveTimezone : IANA zone; the marker then shows the real current time there and
 *                  moves every minute, with a soft pulse (static under reduced motion)
 *   summary   : optional text to show instead of the computed ranges
 * The safe hours are always written out as text above the bar (never colour/position only).
 * Segment changes animate with transform only (translateX + scaleX); instant under reduced motion.
 */
export function SafeHoursBar({ safe = [], from = 6, to = 22, now: fixedNow, liveTimezone, summary: summaryText, tickEvery = 3, className, label = 'Safe outdoors' }) {
  const reduce = usePrefersReducedMotion()
  const tick = useNow(60_000)
  const live = liveTimezone ? clockIn(liveTimezone, new Date(tick)) : null
  const now = live ? live.hour + live.minute / 60 : fixedNow
  const span = to - from
  const pct = (hour) => (Math.min(Math.max(hour, from), to) - from) / span
  const ticks = []
  for (let h = from; h <= to; h += tickEvery) ticks.push(h)
  const summary = summaryText || (safe.length ? safe.map((s) => formatHourRange(s.start, s.end)).join(', ') : 'no safe hours in this period')
  const transition = reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 30 }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <CalendarCheck aria-hidden="true" size={16} className="text-accent" />
        <span>
          {label}: <span className="text-brand-hover">{summary}</span>
        </span>
      </p>

      <div aria-hidden="true">
        <div className="relative">
          <div className="relative h-3 overflow-hidden rounded-pill bg-subtle ring-1 ring-line ring-inset">
            {safe.map((segment, i) => (
              <motion.div
                key={i}
                className="absolute inset-y-0 left-0 w-full bg-mint-strong"
                style={{ originX: 0 }}
                initial={false}
                animate={{ x: `${pct(segment.start) * 100}%`, scaleX: pct(segment.end) - pct(segment.start) }}
                transition={transition}
              />
            ))}
          </div>
          {typeof now === 'number' && now >= from && now <= to && (
            // Full-width wrapper moved by translateX(% of the bar), so the marker can glide
            // with transform only; the visible line sits at the wrapper's left edge.
            <motion.span
              className="pointer-events-none absolute -top-1 left-0 h-5 w-full"
              initial={false}
              animate={{ x: `${pct(now) * 100}%` }}
              transition={reduce ? { duration: 0 } : { duration: 0.6, ease: 'easeInOut' }}
            >
              {live && (
                // Soft pulse on the live marker (CSS scale + opacity); hidden under reduced motion.
                <span className="absolute top-1/2 left-0 size-4 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-ink/25 motion-reduce:hidden" />
              )}
              <span className="absolute top-0 left-0 h-5 w-1 -translate-x-1/2 rounded-pill bg-ink ring-2 ring-surface" />
            </motion.span>
          )}
        </div>

        <div className="relative mt-1.5 h-5">
          {ticks.map((h, i) => (
            <span
              key={h}
              className={cn(
                'absolute top-0 text-[0.7rem] whitespace-nowrap text-muted tabular-nums',
                i === 0 ? 'translate-x-0' : i === ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
              )}
              style={{ left: `${pct(h) * 100}%` }}
            >
              {formatHour(h)}
            </span>
          ))}
        </div>
      </div>
      {typeof now === 'number' && (
        <p className="text-xs text-muted">
          <span className="mr-1.5 inline-block h-2.5 w-1 rounded-pill bg-ink align-middle" aria-hidden="true" />
          Now: {live ? clockLabel(live) : formatHour(now)}
        </p>
      )}
    </div>
  )
}
