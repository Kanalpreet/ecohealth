import { Link } from 'react-router'
import { ArrowRight, LayoutDashboard } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/cn'
import { GlowCircles } from '../air/AirBackground'

const pill = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-pill px-6 text-base font-bold transition-colors'

/** Dark green call-to-action band used at the bottom of every public page. */
export function CtaBand() {
  const { status } = useAuth()
  return (
    <section aria-labelledby="cta-title" className="mx-auto w-full max-w-content px-gutter py-section sm:px-6">
      <div className="relative overflow-hidden rounded-panel bg-linear-to-br from-brand to-forest px-6 py-12 shadow-raised sm:px-12 sm:py-16">
        {/* Solid deep green with a subtle gradient and a few soft glowing circles. */}
        <GlowCircles tone="dark" />
        <div className="relative flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
          <h2 id="cta-title" className="max-w-xl text-h2 font-extrabold text-white">
            Start protecting your family today.
          </h2>
          <div className="flex w-full shrink-0 flex-col gap-3 whitespace-nowrap sm:w-auto sm:flex-row">
            {status === 'authenticated' ? (
              <Link to="/dashboard" className={cn(pill, 'bg-white text-forest hover:bg-brand-soft')}>
                <LayoutDashboard aria-hidden="true" size={20} />
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link to="/register" className={cn(pill, 'bg-white text-forest hover:bg-brand-soft')}>
                  Sign up
                  <ArrowRight aria-hidden="true" size={20} />
                </Link>
                <Link to="/login" className={cn(pill, 'text-white ring-2 ring-white/85 ring-inset hover:bg-white/10')}>
                  Log in
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
