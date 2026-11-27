import { useRef } from 'react'
import { motion, useScroll } from 'motion/react'
import { BellRing, Clock, MapPin, Users } from 'lucide-react'
import { usePrefersReducedMotion } from '../../hooks/useMotionSafe'
import { GlassCard } from '../ui/GlassCard'

const STEPS = [
  { icon: Users, title: 'Add your family', text: 'Ages and health conditions, once.' },
  { icon: MapPin, title: 'Set your home area', text: 'Rounded to about 1 km for privacy.' },
  { icon: Clock, title: 'We watch every hour', text: 'Air quality, heat, cold, UV and more.' },
  { icon: BellRing, title: 'Get timely precautions', text: 'Clear advice before you step outside.' },
]

/**
 * The four user steps. A connecting line "draws itself" as the row scrolls through the
 * viewport (scroll-linked scaleX on desktop, scaleY on mobile: transform only).
 * Reduced motion: the line is simply drawn.
 */
export function StepsRow() {
  const ref = useRef(null)
  const reduce = usePrefersReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'end 55%'] })
  const progress = reduce ? 1 : scrollYProgress

  return (
    <section aria-labelledby="steps-title" className="mx-auto w-full max-w-content px-gutter sm:px-6">
      <h2 id="steps-title" className="sr-only">
        The four steps
      </h2>
      <div ref={ref} className="relative">
        {/* Desktop line: through the number circles. */}
        <div aria-hidden="true" className="absolute top-6 right-[12.5%] left-[12.5%] hidden h-0.5 bg-line lg:block">
          <motion.div className="h-full w-full origin-left bg-accent" style={{ scaleX: progress }} />
        </div>
        {/* Mobile/tablet line: down the left, through the circles. */}
        <div aria-hidden="true" className="absolute top-6 bottom-6 left-6 w-0.5 bg-line lg:hidden">
          <motion.div className="h-full w-full origin-top bg-accent" style={{ scaleY: progress }} />
        </div>

        <ol className="relative grid gap-6 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex gap-4 lg:flex-col lg:items-center lg:text-center">
              <span className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-extrabold text-white shadow-raised ring-4 ring-canvas">
                <span className="sr-only">Step </span>
                {i + 1}
              </span>
              <GlassCard className="flex flex-1 flex-col gap-3 lg:w-full lg:items-center">
                <span className="flex size-11 items-center justify-center rounded-pill bg-brand-soft text-accent ring-1 ring-mint ring-inset">
                  <Icon aria-hidden="true" size={22} />
                </span>
                <h3 className="text-h3 font-bold">{title}</h3>
                <p className="text-muted">{text}</p>
              </GlassCard>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
