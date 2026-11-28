import { AirBackground, StaticParticles } from '../air/AirBackground'

/** Top strip for public pages: soft drifting air gradient with a few faint static particles. */
export function PageHeader({ title, subtitle }) {
  return (
    <section className="relative -mt-18 overflow-hidden pt-18" aria-labelledby="page-title">
      <AirBackground>
        <StaticParticles />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-canvas to-transparent" />
      </AirBackground>
      <div className="relative mx-auto flex max-w-content flex-col items-start gap-4 px-gutter py-12 sm:px-6 sm:py-16">
        <h1 id="page-title" className="text-h1 font-extrabold">
          {title}
        </h1>
        {subtitle && <p className="max-w-2xl text-lead text-muted">{subtitle}</p>}
      </div>
    </section>
  )
}
