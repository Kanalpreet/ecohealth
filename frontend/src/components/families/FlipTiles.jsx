import { useState } from 'react'
import { motion } from 'motion/react'
import { Activity, Baby, HardHat, HeartPulse, Lightbulb, RotateCcw, ToyBrick, UserRound, Wind } from 'lucide-react'
import { usePrefersReducedMotion } from '../../hooks/useMotionSafe'
import { cn } from '../../lib/cn'

/*
 * Signature animation for /for-families: six tiles that flip (Motion rotateY) to show
 * what EcoHealth watches for and one short tip. Each tile is a real <button> with
 * aria-pressed. The hidden face is aria-hidden so screen readers read only what is
 * shown. Reduced motion: the face switches instantly, with no 3D flip.
 */
const TILES = [
  { id: 'children', icon: ToyBrick, title: 'Children', watch: ['PM2.5', 'Heat', 'UV'], tip: 'Plan play outside in the safest hours.' },
  { id: 'elderly', icon: UserRound, title: 'Elderly parents', watch: ['Heat', 'Cold', 'PM2.5'], tip: 'Avoid early-morning cold and evening smog.' },
  {
    id: 'asthma',
    icon: Wind,
    title: 'Asthma & COPD',
    watch: ['PM2.5', 'Cold air', 'Temperature swings'],
    tip: 'Keep your inhaler with you on poor days.',
  },
  { id: 'heart', icon: HeartPulse, title: 'Heart conditions', watch: ['PM2.5', 'Heat', 'Cold'], tip: 'Skip strenuous activity when risk is high.' },
  { id: 'pregnancy', icon: Baby, title: 'Pregnancy', watch: ['Heat', 'PM2.5'], tip: 'Stay cool and hydrated in hot weather.' },
  { id: 'workers', icon: HardHat, title: 'Outdoor workers', watch: ['Heat', 'UV', 'PM2.5'], tip: 'Take shade breaks and drink water every hour.' },
]

function Front({ tile }) {
  const Icon = tile.icon
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-brand-soft text-accent ring-1 ring-mint ring-inset">
        <Icon aria-hidden="true" size={30} />
      </span>
      <span className="text-h3 font-bold text-ink">{tile.title}</span>
      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        <RotateCcw aria-hidden="true" size={13} /> What we watch for
      </span>
    </div>
  )
}

function Back({ tile }) {
  return (
    <div className="flex h-full flex-col gap-3 p-5 text-left">
      <span className="flex items-center gap-2 text-sm font-bold text-ink">
        <Activity aria-hidden="true" size={16} className="text-accent" />
        {tile.title}: what we watch for
      </span>
      <span className="flex flex-wrap gap-1.5">
        {tile.watch.map((w) => (
          <span key={w} className="rounded-pill bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-hover ring-1 ring-mint ring-inset">
            {w}
          </span>
        ))}
      </span>
      <span className="mt-auto flex items-start gap-2 rounded-control bg-subtle p-3 text-sm text-ink">
        <Lightbulb aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-accent" />
        {tile.tip}
      </span>
    </div>
  )
}

function FlipTile({ tile }) {
  const [flipped, setFlipped] = useState(false)
  const reduce = usePrefersReducedMotion()
  const face = 'absolute inset-0 rounded-card border border-glass-line bg-glass-strong shadow-glass'

  return (
    <button
      type="button"
      aria-pressed={flipped}
      onClick={() => setFlipped((v) => !v)}
      className="group relative block h-60 w-full rounded-card text-left [perspective:1200px]"
    >
      {reduce ? (
        // No 3D: just swap the face.
        <span className={cn(face, 'block')}>{flipped ? <Back tile={tile} /> : <Front tile={tile} />}</span>
      ) : (
        <motion.span
          className="absolute inset-0 block"
          style={{ transformStyle: 'preserve-3d' }}
          initial={false}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        >
          <span aria-hidden={flipped} className={cn(face, 'block group-hover:shadow-raised')} style={{ backfaceVisibility: 'hidden' }}>
            <Front tile={tile} />
          </span>
          <span
            aria-hidden={!flipped}
            className={cn(face, 'block')}
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <Back tile={tile} />
          </span>
        </motion.span>
      )}
    </button>
  )
}

export function FlipTiles() {
  return (
    <section aria-labelledby="tiles-title" className="mx-auto w-full max-w-content px-gutter sm:px-6">
      <h2 id="tiles-title" className="sr-only">
        Who EcoHealth helps
      </h2>
      <p className="mb-6 text-sm text-muted">Select a tile to see what we watch for.</p>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((tile) => (
          <li key={tile.id}>
            <FlipTile tile={tile} />
          </li>
        ))}
      </ul>
    </section>
  )
}
