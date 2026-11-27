import { CalendarCheck } from 'lucide-react'
import { AirBackground, GlowCircles } from './air/AirBackground'
import { Logo } from './public/Logo'
import { AirBadge } from './ui/AirBadge'
import { Badge } from './ui/Badge'
import { RiskBadge } from './ui/RiskBadge'

/** Gradient side panel (lg+): logo, tagline and a gently floating EXAMPLE risk card. */
function AuthSidePanel() {
  return (
    <div className="relative hidden flex-col justify-between gap-10 overflow-hidden p-10 lg:flex">
      <AirBackground>
        <GlowCircles />
      </AirBackground>
      <div className="relative">
        <Logo />
        <p className="mt-4 max-w-xs text-lead text-muted">Personal climate-health protection for your whole family.</p>
      </div>

      {/* Floats with a CSS transform loop; static under reduced motion (global CSS rule). */}
      <div className="relative animate-float self-start">
        <div className="glass w-72 rounded-card bg-glass-strong p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-ink">Today at home</p>
            <Badge>Example</Badge>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-sm">
            <span className="text-muted">Air quality · AQI 240</span>
            <AirBadge aqi={240} size="sm" />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3 text-sm">
            <span className="font-semibold text-ink">
              Priya, 34 <span className="font-normal text-muted">· Asthma</span>
            </span>
            <RiskBadge level="High" size="sm" />
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-ink">
            <CalendarCheck aria-hidden="true" size={14} className="text-accent" />
            Safe outdoors: <span className="text-brand-hover">2–5 PM</span>
          </p>
        </div>
      </div>
    </div>
  )
}

/** /login and /register shell: gradient side panel + form card (form only below 1024 px). */
export function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-gutter py-10 sm:px-6 sm:py-14">
      <div className="glass grid overflow-hidden rounded-panel bg-glass-strong lg:grid-cols-[1fr_1fr]">
        <AuthSidePanel />
        <section aria-labelledby="auth-title" className="mx-auto w-full max-w-md p-6 sm:p-10">
          <h1 id="auth-title" className="text-2xl font-extrabold tracking-tight text-brand-hover sm:text-3xl">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <p className="mt-6 text-center text-sm text-muted">{footer}</p>}
        </section>
      </div>
    </div>
  )
}
