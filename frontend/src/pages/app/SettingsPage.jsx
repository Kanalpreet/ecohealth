import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Bell, BellRing, Clock, Database, Download, LogOut, Mail, MapPin, Pencil, Save, Trash2, TriangleAlert, User } from 'lucide-react'
import { LocationPicker } from '../../components/map/LocationPicker'
import { SafeMap } from '../../components/map/SafeMap'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Drawer } from '../../components/ui/Drawer'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { Skeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../hooks/useAuth'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useUpdateMe } from '../../hooks/useFamily'
import { useToast } from '../../hooks/useToast'
import { applyServerErrors } from '../../lib/formErrors'
import { formatCoords, roundPoint, timezoneOptions, userHome } from '../../lib/geo'
import { profileSchema } from '../../lib/validation'
import { cn } from '../../lib/cn'
import * as api from '../../services/api'


function Section({ icon: Icon, title, description, id, tone, children }) {
  const headingId = useId()
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        'scroll-mt-24 rounded-card border p-5 shadow-card sm:p-6',
        tone === 'danger' ? 'border-danger/30 bg-danger-soft' : 'border-line bg-surface',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-pill',
            tone === 'danger' ? 'bg-surface text-danger' : 'bg-brand-soft text-accent',
          )}
        >
          <Icon aria-hidden="true" size={20} />
        </span>
        <div>
          <h2 id={headingId} className="text-h3 font-bold text-ink">
            {title}
          </h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function ProfileSection({ user }) {
  const { toast } = useToast()
  const updateMe = useUpdateMe()
  const [formError, setFormError] = useState(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm({ resolver: zodResolver(profileSchema), values: { name: user.name, timezone: user.timezone } })

  async function save(values) {
    setFormError(null)
    try {
      await updateMe.mutateAsync(values)
      toast({ tone: 'success', title: 'Profile saved' })
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['name', 'timezone']))
    }
  }

  return (
    <Section icon={User} title="Profile" description="Your account details.">
      <form onSubmit={handleSubmit(save)} noValidate className="flex flex-col gap-4">
        {formError && <Alert>{formError}</Alert>}
        <Input label="Name" autoComplete="name" error={errors.name?.message} {...register('name')} />
        <Input label="Email" type="email" value={user.email} readOnly disabled hint="Email changes aren't available yet." />
        <Select label="Time zone" options={timezoneOptions(user.timezone)} error={errors.timezone?.message} hint="Routine times and safe hours use this time zone." {...register('timezone')} />
        <div className="flex justify-end">
          <Button type="submit" icon={Save} loading={updateMe.isPending} disabled={!isDirty}>
            Save profile
          </Button>
        </div>
      </form>
    </Section>
  )
}

function HomeAreaSection({ user }) {
  const { toast } = useToast()
  const updateMe = useUpdateMe()
  const home = userHome(user)
  const [open, setOpen] = useState(false)
  const [point, setPoint] = useState(home)
  const [placeName, setPlaceName] = useState(null)
  const [error, setError] = useState(null)

  function openPicker() {
    setPoint(home)
    setPlaceName(null)
    setError(null)
    setOpen(true)
  }

  async function save() {
    setError(null)
    const p = roundPoint(point)
    try {
      await updateMe.mutateAsync({ home_lat: p.lat, home_lon: p.lon })
      toast({ tone: 'success', title: 'Home area updated' })
      setOpen(false)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <Section id="home-area" icon={MapPin} title="Home area" description="Your primary location for air and weather updates.">
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        {home ? (
          <SafeMap point={home} interactive={false} zoom={11} className="h-48 w-full rounded-card ring-1 ring-line" label="Map preview of your home area" />
        ) : (
          <p className="rounded-card bg-subtle p-4 text-sm text-muted">No home area set yet.</p>
        )}
        <div className="flex flex-col gap-3 md:w-56">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <MapPin aria-hidden="true" size={18} className="text-accent" />
            <span className="tabular-nums">{formatCoords(home)}</span>
          </p>
          <p className="text-xs text-muted">Rounded to about 1 km. Your exact location is never stored.</p>
          <Button variant="secondary" icon={Pencil} onClick={openPicker}>
            Change
          </Button>
        </div>
      </div>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Change home area"
        className="sm:w-[40rem]"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={updateMe.isPending}>
              Cancel
            </Button>
            <Button icon={Save} onClick={save} loading={updateMe.isPending} disabled={!point} className="ml-auto">
              Save home area
            </Button>
          </>
        }
      >
        {error && <Alert className="mb-4">{error}</Alert>}
        {open && (
          <LocationPicker
            value={point}
            placeName={placeName}
            onChange={(p, name) => {
              setPoint(p)
              setPlaceName(name)
            }}
          />
        )}
      </Drawer>
    </Section>
  )
}

const ALERT_ROWS = [
  { icon: Mail, label: 'Daily 6 AM brief by email' },
  { icon: BellRing, label: 'Browser notifications' },
  { icon: Clock, label: 'Quiet hours (10 PM – 6 AM)' },
]

function AlertsSection() {
  return (
    <Section icon={Bell} title="Alerts" description="Choose how and when you want to get updates.">
      <ul className="flex flex-col divide-y divide-line">
        {ALERT_ROWS.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-3 py-3 opacity-70">
            <Icon aria-hidden="true" size={18} className="text-muted" />
            <span className="flex-1 text-sm text-ink">{label}</span>
            <Badge>Coming soon</Badge>
            <span
              role="switch"
              aria-checked="false"
              aria-disabled="true"
              aria-label={`${label} (coming soon)`}
              className="relative inline-flex h-6 w-11 cursor-not-allowed rounded-pill bg-line-strong/40"
            >
              <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow-card" />
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function DataSection() {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  async function download() {
    setBusy(true)
    try {
      const data = await api.exportMe()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ecohealth-data-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({ tone: 'success', title: 'Your data was downloaded' })
    } catch (error) {
      toast({ tone: 'error', title: "Couldn't download your data", description: error.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section icon={Database} title="Your data" description="Get a copy of your account, family members and routines (JSON).">
      <Button variant="secondary" icon={Download} onClick={download} loading={busy}>
        Download my data
      </Button>
    </Section>
  )
}

function DangerSection() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await api.deleteMe()
      // Leave the protected area first: clearing the session while still on /settings
      // would make the route guard redirect to /login instead of the home page.
      navigate('/', { replace: true })
      await logout()
      toast({ tone: 'info', title: 'Your account was deleted', description: 'All of your data has been removed.' })
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <Section icon={TriangleAlert} title="Danger zone" tone="danger">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink">This permanently deletes your account and all family data. It can't be undone.</p>
        <Button variant="danger" icon={Trash2} onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => !busy && (setOpen(false), setTyped(''))}
        title="Delete your account?"
        description="Your account, family members and routines will be deleted permanently. Type DELETE to confirm."
        footer={
          <>
            <Button variant="secondary" onClick={() => (setOpen(false), setTyped(''))} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} loading={busy} disabled={typed !== 'DELETE'}>
              Delete account
            </Button>
          </>
        }
      >
        {error && <Alert className="mb-3">{error}</Alert>}
        <Input label="Type DELETE to confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Modal>
    </Section>
  )
}

/** /settings: profile, home area, alerts (coming soon), data export, delete account, log out. */
export function SettingsPage() {
  useDocumentTitle('Settings')
  const { user, logout } = useAuth()
  if (!user) return <Skeleton className="h-64 w-full" />
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 font-extrabold text-brand-hover">Settings</h1>
        <p className="mt-1 text-muted">Manage your account, location, alerts and data.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileSection user={user} />
        <HomeAreaSection user={user} />
        <AlertsSection />
        <DataSection />
      </div>
      <DangerSection />
      <div>
        <Button variant="secondary" icon={LogOut} onClick={logout}>
          Log out
        </Button>
      </div>
    </div>
  )
}
