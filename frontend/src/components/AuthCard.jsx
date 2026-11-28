import { useId } from 'react'
import { CalendarCheck, CalendarClock, ShieldCheck, Users } from 'lucide-react'
import { AirBackground, GlowCircles } from './air/AirBackground'
import { Logo } from './public/Logo'
import { AirBadge } from './ui/AirBadge'
import { Badge } from './ui/Badge'
import { RiskBadge } from './ui/RiskBadge'
import { SafeHoursBar } from './ui/SafeHoursBar'
import { cn } from '../lib/cn'

/* ------------------------------------------------------------------------------------------
 * Login panel (lg+): logo, tagline and a small gently floating EXAMPLE card.
 * ---------------------------------------------------------------------------------------- */
function LoginPanel() {
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

/* ------------------------------------------------------------------------------------------
 * Register panel (md+): headline, three benefits and a larger floating EXAMPLE family card.
 * ---------------------------------------------------------------------------------------- */
const BENEFITS = [
  { icon: Users, text: 'A personal risk score for each family member' },
  { icon: CalendarClock, text: 'Safe hours to go outside, every day' },
  { icon: ShieldCheck, text: 'Private by design: rounded location, delete anytime' },
]

// SAMPLE data only (labelled "Example"): the same air, a different risk for each person.
const FAMILY = [
  { name: 'Priya, 34', detail: 'Asthma', level: 'High' },
  { name: 'Aarav, 6', detail: null, level: 'Moderate' },
  { name: 'Papa, 68', detail: 'Heart', level: 'Very High' },
]

function FamilyExampleCard() {
  return (
    <div className="glass w-full rounded-card bg-glass-strong p-4 lg:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink">Today at home</p>
        <Badge>Example</Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-baseline gap-1.5">
          <span className="text-xs font-semibold text-muted">AQI</span>
          <span className="text-3xl font-extrabold tracking-tight text-ink tabular-nums">240</span>
        </p>
        <AirBadge aqi={240} size="sm" />
      </div>

      <ul aria-label="Example family" className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
        {FAMILY.map((p) => (
          <li key={p.name} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate font-semibold text-ink">
              {p.name}
              {p.detail && <span className="font-normal text-muted"> · {p.detail}</span>}
            </span>
            <RiskBadge level={p.level} size="sm" />
          </li>
        ))}
      </ul>

      <SafeHoursBar className="mt-4 border-t border-line pt-3" safe={[{ start: 14, end: 17 }]} from={6} to={22} tickEvery={4} />
    </div>
  )
}

function RegisterPanel() {
  return (
    <div className="relative hidden flex-col justify-between gap-8 overflow-hidden p-8 md:flex lg:p-10">
      <AirBackground>
        <GlowCircles />
      </AirBackground>

      <div className="relative">
        <Logo />
        <p className="mt-6 text-2xl leading-tight font-extrabold tracking-tight text-ink lg:text-3xl">
          Protect your whole family from climate risks.
        </p>
        <p className="mt-2 max-w-xs text-muted lg:text-lead">Personal climate-health protection for your whole family.</p>
      </div>

      <ul className="relative flex flex-col gap-3.5">
        {BENEFITS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3 text-sm font-semibold text-ink">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-mint text-brand-hover ring-1 ring-mint-strong/60 ring-inset">
              <Icon aria-hidden="true" size={18} />
            </span>
            {text}
          </li>
        ))}
      </ul>

      {/* Floats with a CSS transform loop; static under reduced motion (global CSS rule). */}
      <div className="relative w-full animate-float lg:w-[85%]">
        <FamilyExampleCard />
      </div>
    </div>
  )
}

/**
 * One side of the auth card (`variant` "login" or "register"): its own gradient panel plus
 * the form. Login shows its panel from 1024 px, Register from 768 px; below that only the
 * form. The two sides are stacked and flipped by `pages/AuthFlipPage.jsx`, which also owns
 * the outer page padding. `titleRef` lets the flip move focus to this side's heading.
 *
 * The surface is the glass colour without backdrop blur: blur inside a 3D-flipped element
 * breaks `backface-visibility` in some browsers (the canvas behind is flat, so it looks the same).
 */
export function AuthCard({ variant = 'login', title, subtitle, titleRef, children, footer, className }) {
  const titleId = useId()
  const isRegister = variant === 'register'
  return (
    <div
      className={cn(
        'grid overflow-hidden rounded-panel border border-glass-line bg-glass-strong shadow-glass',
        isRegister ? 'md:grid-cols-[1fr_1fr]' : 'lg:grid-cols-[1fr_1fr]',
        className,
      )}
    >
      {isRegister ? <RegisterPanel /> : <LoginPanel />}
      <section aria-labelledby={titleId} className="mx-auto w-full max-w-md self-center p-6 sm:p-10">
        <h1
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className="text-2xl font-extrabold tracking-tight text-brand-hover focus:outline-none sm:text-3xl"
        >
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <p className="mt-6 text-center text-sm text-muted">{footer}</p>}
      </section>
    </div>
  )
}
