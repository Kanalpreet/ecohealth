import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, Check, Users } from 'lucide-react'
import { MemberForm } from '../../components/family/MemberForm'
import { LocationPicker } from '../../components/map/LocationPicker'
import { Logo } from '../../components/public/Logo'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMemberMutations, useMembers, useUpdateMe } from '../../hooks/useFamily'
import { useToast } from '../../hooks/useToast'
import { cn } from '../../lib/cn'
import { conditionLabel } from '../../lib/family'
import { browserTimezone, roundPoint, userHome } from '../../lib/geo'

const STEPS = ['Account', 'Home area', 'Family']

function StepIndicator({ current }) {
  return (
    <ol aria-label="Setup progress" className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
      {STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-4">
            <span
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-pill px-3 py-1.5 text-sm font-semibold',
                active ? 'bg-brand-soft text-brand-hover' : done ? 'text-ink' : 'text-muted',
              )}
            >
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-xs font-bold',
                  done ? 'bg-brand text-white' : active ? 'bg-brand text-white' : 'bg-surface ring-1 ring-line-strong/50',
                )}
              >
                {done ? <Check aria-hidden="true" size={14} /> : i + 1}
              </span>
              {label}
              {done && <span className="sr-only"> (done)</span>}
            </span>
            {i < STEPS.length - 1 && <span aria-hidden="true" className="hidden h-px w-8 bg-line-strong/40 sm:block" />}
          </li>
        )
      })}
    </ol>
  )
}

function HomeStep({ onDone }) {
  const { user } = useAuth()
  const updateMe = useUpdateMe()
  const [point, setPoint] = useState(userHome(user))
  const [placeName, setPlaceName] = useState(null)
  const [timezone, setTimezone] = useState(user?.timezone && userHome(user) ? user.timezone : browserTimezone())
  const [error, setError] = useState(null)

  async function save() {
    setError(null)
    const p = roundPoint(point)
    try {
      await updateMe.mutateAsync({ home_lat: p.lat, home_lon: p.lon, timezone })
      onDone()
    } catch (e) {
      setError(e.fieldErrors?.timezone ? `Time zone: ${e.fieldErrors.timezone}` : e.message)
    }
  }

  return (
    <section aria-labelledby="home-step-title" className="flex flex-col gap-6">
      <div className="text-center">
        <h1 id="home-step-title" className="text-h1 font-extrabold text-brand-hover">
          Where is home?
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-muted">
          We use your area to check air quality and weather. Your location is rounded to about 1 km for privacy.
        </p>
      </div>
      {error && <Alert>{error}</Alert>}
      <LocationPicker
        value={point}
        placeName={placeName}
        onChange={(p, name) => {
          setPoint(p)
          setPlaceName(name)
        }}
        timezone={timezone}
        onTimezoneChange={setTimezone}
      />
      <div className="flex justify-end">
        <Button icon={ArrowRight} onClick={save} disabled={!point} loading={updateMe.isPending} className="rounded-pill px-8">
          Continue
        </Button>
      </div>
    </section>
  )
}

function FamilyStep() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const members = useMembers()
  const m = useMemberMutations()
  const list = members.data || []

  async function add(body) {
    const member = await m.create.mutateAsync(body)
    toast({ tone: 'success', title: `${member.name} added` })
  }

  return (
    <section aria-labelledby="family-step-title" className="flex flex-col gap-6">
      <div className="text-center">
        <h1 id="family-step-title" className="text-h1 font-extrabold text-brand-hover">
          Who's in your family?
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-muted">
          Add at least one person (you can add yourself). You can add routines and more people later.
        </p>
      </div>

      {list.length > 0 && (
        <ul aria-label="Added so far" className="flex flex-wrap gap-2">
          {list.map((member) => (
            <li key={member.id} className="inline-flex items-center gap-2 rounded-pill bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand-hover">
              <Users aria-hidden="true" size={14} />
              {member.name}, {member.age}
              {member.conditions.length > 0 && <span className="font-normal">· {member.conditions.map(conditionLabel).join(', ')}</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-card border border-line bg-surface p-5 sm:p-6">
        <MemberForm onSubmit={add} submitLabel={list.length ? 'Add another member' : 'Add member'} />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={() => navigate('/dashboard', { replace: true })}>
          {list.length ? 'Add more later' : 'Skip for now'}
        </Button>
        <Button icon={ArrowRight} onClick={() => navigate('/dashboard', { replace: true })} disabled={!list.length} className="rounded-pill px-8">
          Go to dashboard
        </Button>
      </div>
    </section>
  )
}

/** /onboarding: Account (done) -> Home area (PATCH /me) -> Family (optional). */
export function OnboardingPage() {
  useDocumentTitle('Set up')
  const [step, setStep] = useState(1)
  return (
    <div className="min-h-dvh px-gutter py-6 sm:px-6">
      <header className="mx-auto flex max-w-4xl items-center">
        <Logo to="/" />
      </header>
      <main id="main" className="mx-auto mt-6 max-w-4xl rounded-panel border border-line bg-surface/80 p-5 shadow-card sm:p-10">
        <StepIndicator current={step} />
        <div className="mt-8">{step === 1 ? <HomeStep onDone={() => setStep(2)} /> : <FamilyStep />}</div>
      </main>
    </div>
  )
}
