import { useId, useState } from 'react'
import { motion } from 'motion/react'
import { cn } from '../../lib/cn'
import { usePrefersReducedMotion } from '../../hooks/useMotionSafe'

/**
 * "Why this score?" breakdown (reused on the dashboard in F4).
 *
 *   factors  : bar segments, shares add up to 100
 *              [{ id, name, share, className: 'bg-…' }]
 *   rows     : optional factor rows with icon and value; `factorId` links a row to its
 *              segment. Rows without a segment (share 0, e.g. "Heat – none") are allowed.
 *              [{ id, factorId?, icon, label, value: node }]
 *   revealed : how many segments are filled (default all), for filling segment by segment
 *   stagger  : seconds between segments when they fill (0 = together)
 *
 * Without `rows`, a compact legend (name + %) is shown instead.
 * Interaction: hovering or focusing a segment highlights its row, and hovering or
 * focusing a row highlights its segment (keyboard: Tab through segments and rows).
 * Shares are always written out as text; colour is never the only signal.
 * Segments grow with transform only (translateX + scaleX); instant under reduced motion.
 */
export function FactorBar({ factors, rows, revealed = factors.length, stagger = 0, className, label = 'What raises the score' }) {
  const reduce = usePrefersReducedMotion()
  const baseId = useId()
  const [active, setActive] = useState(null)
  const segments = factors.map((f, i) => ({
    ...f,
    id: f.id || f.name,
    start: factors.slice(0, i).reduce((sum, prev) => sum + prev.share, 0),
  }))
  const rowIdFor = (factorId) => {
    const row = rows?.find((r) => r.factorId === factorId)
    return row ? `${baseId}-row-${row.id}` : undefined
  }
  const highlight = (id) => ({
    onMouseEnter: () => setActive(id),
    onMouseLeave: () => setActive(null),
    onFocus: () => setActive(id),
    onBlur: () => setActive(null),
  })

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="relative">
        {/* Visual bar: animated segments (decorative). */}
        <div aria-hidden="true" className="relative h-4 overflow-hidden rounded-pill bg-subtle ring-1 ring-line ring-inset">
          {segments.map((s, i) => (
            <motion.div
              key={s.id}
              className={cn(
                'absolute inset-y-0 left-0 w-full transition-opacity duration-150',
                s.className,
                active && active !== s.id && 'opacity-35',
              )}
              style={{ originX: 0, x: `${s.start}%` }}
              initial={false}
              animate={{ scaleX: i < revealed ? s.share / 100 : 0 }}
              transition={reduce ? { duration: 0 } : { duration: 0.55, delay: i * stagger, ease: [0.22, 1, 0.36, 1] }}
            />
          ))}
        </div>
        {/* Interactive hit areas over each share (static position; carry the focus ring). */}
        {rows && (
          <div className="absolute inset-0">
            {segments.map((s) => (
              <span
                key={s.id}
                tabIndex={0}
                role="img"
                aria-label={`${s.name}: ${s.share}% of the score`}
                aria-describedby={rowIdFor(s.id)}
                className={cn(
                  'absolute inset-y-0 cursor-default rounded-pill outline-offset-2',
                  active === s.id && 'ring-2 ring-ink ring-offset-1',
                )}
                style={{ left: `${s.start}%`, width: `${s.share}%` }}
                {...highlight(s.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Shares in text. */}
      <ul aria-label={label} className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink">
        {segments.map((s) => (
          <li key={s.id} className={cn('flex items-center gap-1.5 rounded-sm', active === s.id && 'font-semibold')}>
            <span aria-hidden="true" className={cn('size-2.5 rounded-full', s.className)} />
            {s.name} <span className="font-semibold tabular-nums">{s.share}%</span>
          </li>
        ))}
      </ul>

      {rows && (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((row) => {
            const Icon = row.icon
            const linked = row.factorId && segments.some((s) => s.id === row.factorId)
            const isActive = linked && active === row.factorId
            return (
              <li
                key={row.id}
                id={`${baseId}-row-${row.id}`}
                tabIndex={linked ? 0 : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-control px-2 py-2.5 transition-colors',
                  isActive && 'bg-brand-soft',
                )}
                {...(linked ? highlight(row.factorId) : {})}
              >
                {Icon && (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-subtle text-accent">
                    <Icon aria-hidden="true" size={18} />
                  </span>
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold text-ink">{row.label}</span>
                  <span className="text-muted"> – </span>
                  <span className="text-ink">{row.value}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
