import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, CircleCheck, Play, Sparkles } from 'lucide-react'
import { usePrefersReducedMotion } from '../../hooks/useMotionSafe'
import { useAirClearing } from '../../hooks/useAirClearing'
import { cn } from '../../lib/cn'
import { AirBackground } from '../air/AirBackground'
import { ParticleField } from '../air/ParticleField'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Pill } from '../ui/Pill'
import { HeroCard } from './HeroCard'

const TICKS = ['Personalized Risk', 'Real-time Alerts', 'Home & Travel Mode']

export function HomeHero() {
  const reduce = usePrefersReducedMotion()
  const [demoOpen, setDemoOpen] = useState(false)
  const heroRef = useRef(null)
  const particlesRef = useRef(null)
  const hazeRef = useRef(null)
  const brightRef = useRef(null)
  useAirClearing({ enabled: !reduce, triggerRef: heroRef, particlesRef, hazeRef, brightRef })

  return (
    <section ref={heroRef} aria-labelledby="hero-title" className="relative -mt-18 overflow-hidden pt-18">
      {/* ---- "Clean air, made visible": gradient + haze + PM2.5 particles (decorative) ---- */}
      <AirBackground>
        {/* Polluted state: a pale grey wash. Under reduced motion it is not shown (clear air). */}
        <div ref={hazeRef} className={cn('absolute inset-0 bg-air-haze/45', reduce && 'opacity-0')} />
        {/* Clear state: brighter mint/sky light that fades in as the air clears. */}
        <div
          ref={brightRef}
          className={cn(
            'absolute inset-0 bg-[radial-gradient(60%_55%_at_75%_20%,rgb(255_255_255/0.95),transparent_70%),radial-gradient(45%_45%_at_15%_80%,rgb(205_238_215/0.7),transparent_70%)]',
            reduce ? 'opacity-100' : 'opacity-0',
          )}
        />
        {!reduce && (
          <div ref={particlesRef} className="absolute inset-0 will-change-transform">
            <ParticleField />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-canvas to-transparent" />
      </AirBackground>

      {/* ---- Content ---- */}
      <div className="relative mx-auto grid max-w-content items-center gap-12 px-gutter pt-10 pb-24 sm:px-6 sm:pt-16 lg:min-h-[calc(100svh-4.5rem)] lg:grid-cols-[1.15fr_0.85fr] lg:pb-32">
        <div className="flex flex-col items-start gap-6">
          <Pill icon={Sparkles}>AI-Powered Climate Health</Pill>
          <h1 id="hero-title" className="text-display font-extrabold">
            Stay Healthy in a{' '}
            <span className="block text-accent">
              Changing Climate<span className="-ml-[0.08em]">.</span>
            </span>
          </h1>
          <p className="max-w-xl text-lead text-muted">
            EcoHealth turns air pollution, heat, cold, UV and altitude into clear, personal risk awareness for every
            member of your family, so you know the safest hours to step outside.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              to="/register"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-pill bg-brand px-7 text-base font-bold text-white shadow-raised transition-colors hover:bg-brand-hover"
            >
              Get Started
              <ArrowRight aria-hidden="true" size={20} />
            </Link>
            <Button
              variant="secondary"
              icon={Play}
              onClick={() => setDemoOpen(true)}
              className="min-h-12 rounded-pill px-7 text-base ring-0"
            >
              Watch Demo
            </Button>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {TICKS.map((tick) => (
              <li key={tick} className="flex items-center gap-2 text-sm font-semibold text-ink">
                <CircleCheck aria-hidden="true" size={18} className="text-accent" />
                {tick}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-center lg:justify-end">
          <HeroCard />
        </div>
      </div>

      <Modal
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        title="Demo coming soon"
        description="A short walkthrough video of EcoHealth is on its way. In the meantime, you can create an account and try it with your own family."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDemoOpen(false)}>
              Close
            </Button>
            <Button to="/register" icon={ArrowRight}>
              Get Started
            </Button>
          </>
        }
      />
    </section>
  )
}
