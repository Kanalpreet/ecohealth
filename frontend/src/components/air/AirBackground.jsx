import { cn } from '../../lib/cn'

/*
 * "Clean air, made visible" background: a soft, slowly shifting gradient of mint,
 * white and a hint of sky blue. Three large blurred colour fields drift with CSS
 * transforms (animate-air-*); the global reduced-motion rule makes them static.
 * Decorative only (aria-hidden). Children render on top (e.g. haze, particles).
 */
export function AirBackground({ className, children, tone = 'light' }) {
  const dark = tone === 'dark'
  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div className={cn('absolute inset-0', dark ? 'bg-linear-to-br from-brand to-forest' : 'bg-canvas')} />
      <div
        className={cn(
          'absolute -top-1/4 -left-1/4 h-[85%] w-[70%] animate-air-a rounded-full blur-3xl',
          dark ? 'bg-[rgb(52_168_96/0.35)]' : 'bg-air-mint/90',
        )}
      />
      <div
        className={cn(
          'absolute -top-1/3 right-[-15%] h-[90%] w-[65%] animate-air-b rounded-full blur-3xl',
          dark ? 'bg-[rgb(134_210_158/0.18)]' : 'bg-sky-hint',
        )}
      />
      <div
        className={cn(
          'absolute bottom-[-35%] left-[25%] h-[70%] w-[60%] animate-air-c rounded-full blur-3xl',
          dark ? 'bg-[rgb(14_59_34/0.6)]' : 'bg-white/90',
        )}
      />
      {children}
    </div>
  )
}

/** Soft glowing circles (decorative accents for CTA band, Travel preview, auth panel). */
export function GlowCircles({ tone = 'light', className }) {
  const fill = tone === 'dark' ? 'bg-[rgb(134_210_158/0.22)]' : 'bg-white/70'
  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <span className={cn('absolute -top-10 right-[12%] size-48 rounded-full blur-2xl', fill)} />
      <span className={cn('absolute bottom-[-3rem] left-[8%] size-56 rounded-full blur-2xl', fill)} />
      <span
        className={cn(
          'absolute top-[35%] left-[45%] size-24 rounded-full blur-xl',
          tone === 'dark' ? 'bg-[rgb(255_255_255/0.08)]' : 'bg-mint/70',
        )}
      />
    </div>
  )
}

// Fixed positions so the page is identical on every render (no randomness in render).
const STATIC_DOTS = [
  { top: '22%', left: '58%', size: 6, opacity: 0.18 },
  { top: '38%', left: '72%', size: 4, opacity: 0.14 },
  { top: '64%', left: '66%', size: 8, opacity: 0.12 },
  { top: '30%', left: '86%', size: 5, opacity: 0.16 },
  { top: '72%', left: '88%', size: 4, opacity: 0.13 },
  { top: '16%', left: '78%', size: 3, opacity: 0.15 },
  { top: '54%', left: '52%', size: 3, opacity: 0.11 },
  { top: '80%', left: '76%', size: 6, opacity: 0.1 },
]

/** A few faint, static particles (page headers). */
export function StaticParticles({ className }) {
  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0', className)}>
      {STATIC_DOTS.map((d, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-particle blur-[1px]"
          style={{ top: d.top, left: d.left, width: d.size, height: d.size, opacity: d.opacity }}
        />
      ))}
    </div>
  )
}
