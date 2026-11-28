import { lazy, Suspense, useId, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, MapPin, Save, Search, Trash2 } from 'lucide-react'
import { MapErrorBoundary } from '../../components/map/SafeMap'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Input } from '../../components/ui/Input'
import { PreviewLockedButton, SampleDataTag } from '../../components/ui/Preview'
import { Select } from '../../components/ui/Select'
import { Skeleton } from '../../components/ui/Skeleton'
import { Spinner } from '../../components/ui/Spinner'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMembers } from '../../hooks/useFamily'
import { useToast } from '../../hooks/useToast'
import { useTrip, useTripMutations, useTrips } from '../../hooks/useTripsAlerts'
import { cn } from '../../lib/cn'
import { controlClasses } from '../../lib/field'
import { round2 } from '../../lib/geo'
import { PREVIEW_MEMBERS } from '../../lib/previewData'
import { formatElevation, toTripBody, TRIP_TYPES, validateTrip } from '../../lib/trips'
import { searchPlaces } from '../../services/geocoding'

const RouteMap = lazy(() => import('../../components/map/RouteMap'))

const STEPS = ['Details', 'Travellers', 'Stops', 'Review']
const STEP_FIELDS = [
  (k) => ['name', 'trip_type', 'start_date', 'end_date'].includes(k),
  (k) => k === 'member_ids',
  (k) => k === 'stops' || k.startsWith('stop-'),
  () => true,
]

const EMPTY = { name: '', trip_type: 'holiday', start_date: '', end_date: '', member_ids: [], stops: [] }

function StopSearch({ onAdd }) {
  const id = useId()
  const [text, setText] = useState('')
  const term = useDebouncedValue(text.trim(), 350)
  const search = useQuery({
    queryKey: ['geocode', term],
    queryFn: ({ signal }) => searchPlaces(term, { signal }),
    enabled: term.length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  })
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        Add a stop
      </label>
      <div className="relative">
        <Search aria-hidden="true" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input
          id={id}
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search a city or place"
          autoComplete="off"
          className={cn(controlClasses, 'border-line-strong pl-10')}
        />
      </div>
      {term.length >= 2 && (
        <div aria-live="polite">
          {search.isFetching && <Spinner label="Searching" />}
          {search.isError && <Alert>{search.error.message}</Alert>}
          {search.isSuccess && search.data.length === 0 && <p className="text-sm text-muted">No places found for “{term}”.</p>}
          {search.data?.length > 0 && (
            <ul aria-label="Search results" className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-card border border-line bg-surface p-1.5">
              {search.data.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onAdd(p)
                      setText('')
                    }}
                    className="flex min-h-11 w-full items-start gap-2 rounded-control px-3 py-2 text-left text-sm hover:bg-subtle"
                  >
                    <MapPin aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-accent" />
                    <span>
                      <span className="font-semibold text-ink">{p.name}</span>
                      {p.region && <span className="text-muted"> · {p.region}</span>}
                      {typeof p.elevation_m === 'number' && <span className="text-muted"> · {formatElevation(p.elevation_m)}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function TripForm({ initial, tripId, preview, members }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const m = useTripMutations()
  const [v, setV] = useState(initial)
  const [step, setStep] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const [formError, setFormError] = useState(null)
  const errors = validateTrip(v)
  const stepErrors = Object.entries(errors).filter(([k]) => STEP_FIELDS[step](k))
  const err = (k) => (showErrors ? errors[k] : undefined)
  const set = (patch) => setV((cur) => ({ ...cur, ...patch }))
  const setStop = (i, patch) => setV((cur) => ({ ...cur, stops: cur.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))

  function next() {
    if (stepErrors.length) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function move(i, dir) {
    setV((cur) => {
      const stops = [...cur.stops]
      const j = i + dir
      if (j < 0 || j >= stops.length) return cur
      ;[stops[i], stops[j]] = [stops[j], stops[i]]
      return { ...cur, stops }
    })
  }

  function addStop(place) {
    setV((cur) => {
      const prev = cur.stops[cur.stops.length - 1]
      const arrive = prev?.leave_date || cur.start_date || ''
      return {
        ...cur,
        stops: [
          ...cur.stops,
          {
            place: place.name,
            lat: round2(place.lat),
            lon: round2(place.lon),
            elevation_m: place.elevation_m,
            arrive_date: arrive,
            leave_date: cur.end_date || arrive,
          },
        ],
      }
    })
  }

  async function save() {
    if (Object.keys(errors).length) {
      setShowErrors(true)
      return
    }
    setFormError(null)
    try {
      const body = toTripBody(v)
      const trip = tripId ? await m.update.mutateAsync({ id: tripId, changes: body }) : await m.create.mutateAsync(body)
      toast({ tone: 'success', title: tripId ? 'Trip saved' : 'Trip created' })
      navigate(`/trips/${trip?.id || tripId}`)
    } catch (error) {
      setFormError(error.message)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ol aria-label="Steps" className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => (i < step ? setStep(i) : undefined)}
              aria-current={i === step ? 'step' : undefined}
              disabled={i > step}
              className={cn(
                'flex min-h-10 items-center gap-2 rounded-pill px-3 text-sm font-semibold',
                i === step ? 'bg-brand-soft text-brand-hover' : i < step ? 'text-ink hover:bg-subtle' : 'text-muted',
              )}
            >
              <span className={cn('flex size-6 items-center justify-center rounded-full text-xs', i <= step ? 'bg-brand text-white' : 'ring-1 ring-line-strong/50')}>
                {i < step ? <Check aria-hidden="true" size={13} /> : i + 1}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <div className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        {formError && <Alert className="mb-4">{formError}</Alert>}
        {showErrors && stepErrors.length > 0 && (
          <Alert className="mb-4">
            <ul>
              {stepErrors.map(([k, msg]) => (
                <li key={k}>{msg}</li>
              ))}
            </ul>
          </Alert>
        )}

        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Trip name" value={v.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} error={err('name')} className="sm:col-span-2" />
            <Select label="Trip type" value={v.trip_type} options={TRIP_TYPES} onChange={(e) => set({ trip_type: e.target.value })} error={err('trip_type')} />
            <div className="hidden sm:block" />
            <Input label="Start date" type="date" value={v.start_date} onChange={(e) => set({ start_date: e.target.value })} error={err('start_date')} />
            <Input label="End date" type="date" value={v.end_date} min={v.start_date || undefined} onChange={(e) => set({ end_date: e.target.value })} error={err('end_date')} />
          </div>
        )}

        {step === 1 && (
          <fieldset>
            <legend className="text-sm font-semibold text-ink">Who is travelling?</legend>
            {members.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                Add family members first on the <Link to="/family" className="font-semibold text-accent underline">Family</Link> page.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {members.map((mem) => {
                  const checked = v.member_ids.includes(mem.id)
                  return (
                    <label
                      key={mem.id}
                      className={cn(
                        'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill px-4 text-sm font-semibold ring-1 ring-inset',
                        'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                        checked ? 'bg-brand-soft text-brand-hover ring-accent' : 'bg-surface text-ink ring-line-strong/50 hover:bg-subtle',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => set({ member_ids: checked ? v.member_ids.filter((x) => x !== mem.id) : [...v.member_ids, mem.id] })}
                      />
                      {checked && <Check aria-hidden="true" size={16} />}
                      {mem.name}, {mem.age}
                    </label>
                  )
                })}
              </div>
            )}
            {err('member_ids') && <p className="mt-2 text-sm font-medium text-danger">{err('member_ids')}</p>}
          </fieldset>
        )}

        {step === 2 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <StopSearch onAdd={addStop} />
              {v.stops.length === 0 && <p className="text-sm text-muted">No stops yet. Search for the first place you'll visit.</p>}
              <ol className="flex flex-col gap-3">
                {v.stops.map((s, i) => (
                  <li key={`${s.place}-${i}`} className={cn('rounded-card p-4 ring-1 ring-inset', err(`stop-${i}`) ? 'bg-danger-soft ring-danger/30' : 'bg-subtle ring-line')}>
                    <div className="flex items-start gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-ink">{s.place}</p>
                        <p className="text-xs text-muted">{formatElevation(s.elevation_m)}</p>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="flex size-9 items-center justify-center rounded-control text-muted hover:bg-surface disabled:opacity-40" aria-label={`Move ${s.place} up`}>
                          <ArrowUp aria-hidden="true" size={16} />
                        </button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === v.stops.length - 1} className="flex size-9 items-center justify-center rounded-control text-muted hover:bg-surface disabled:opacity-40" aria-label={`Move ${s.place} down`}>
                          <ArrowDown aria-hidden="true" size={16} />
                        </button>
                        <button type="button" onClick={() => set({ stops: v.stops.filter((_, j) => j !== i) })} className="flex size-9 items-center justify-center rounded-control text-muted hover:bg-danger-soft hover:text-danger" aria-label={`Remove ${s.place}`}>
                          <Trash2 aria-hidden="true" size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <Input label="Arrive" type="date" value={s.arrive_date} onChange={(e) => setStop(i, { arrive_date: e.target.value })} />
                      <Input label="Leave" type="date" value={s.leave_date} onChange={(e) => setStop(i, { leave_date: e.target.value })} />
                    </div>
                    {err(`stop-${i}`) && <p className="mt-2 text-sm font-medium text-danger">{err(`stop-${i}`)}</p>}
                  </li>
                ))}
              </ol>
              {err('stops') && <p className="text-sm font-medium text-danger">{err('stops')}</p>}
            </div>
            <MapErrorBoundary fallback={<p className="rounded-card bg-subtle p-4 text-sm text-muted">The map can't be shown right now. Your stops are listed on the left.</p>}>
              <Suspense fallback={<Skeleton className="h-80 w-full" />}>
                <RouteMap stops={v.stops} className="h-80 w-full ring-1 ring-line lg:h-full lg:min-h-80" fallback={<p className="rounded-card bg-subtle p-4 text-sm text-muted">The map can't be shown right now. Your stops are listed on the left.</p>} />
              </Suspense>
            </MapErrorBoundary>
          </div>
        )}

        {step === 3 && (
          <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted">Name</dt>
            <dd className="font-semibold text-ink">{v.name}</dd>
            <dt className="text-muted">Type</dt>
            <dd className="text-ink">{TRIP_TYPES.find((t) => t.value === v.trip_type)?.label}</dd>
            <dt className="text-muted">Dates</dt>
            <dd className="text-ink">
              {v.start_date} → {v.end_date}
            </dd>
            <dt className="text-muted">Travellers</dt>
            <dd className="text-ink">{members.filter((mem) => v.member_ids.includes(mem.id)).map((mem) => mem.name).join(', ')}</dd>
            <dt className="text-muted">Route</dt>
            <dd className="text-ink">{v.stops.map((s) => `${s.place} (${s.arrive_date} → ${s.leave_date})`).join(' → ')}</dd>
          </dl>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="secondary" icon={ArrowLeft} onClick={() => (step === 0 ? navigate(tripId ? `/trips/${tripId}` : '/trips') : setStep(step - 1))}>
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button icon={ArrowRight} onClick={next}>
            Next
          </Button>
        ) : preview ? (
          <PreviewLockedButton icon={Save} reason="Not available in this version">
            Save trip
          </PreviewLockedButton>
        ) : (
          <Button icon={Save} onClick={save} loading={m.create.isPending || m.update.isPending}>
            Save trip
          </Button>
        )}
      </div>
    </div>
  )
}

/** /trips/new and /trips/:id/edit: step-by-step trip form. */
export function TripFormPage() {
  const { tripId } = useParams()
  useDocumentTitle(tripId ? 'Edit trip' : 'Plan a trip')
  const trips = useTrips()
  const preview = trips.data?.preview
  const members = useMembers()
  const trip = useTrip(tripId, { preview })
  const memberList = preview ? PREVIEW_MEMBERS : members.data || []

  const loading = trips.isLoading || (tripId && trip.isLoading) || (!preview && members.isLoading)
  return (
    <div className="flex flex-col gap-6">
      <Link to={tripId ? `/trips/${tripId}` : '/trips'} className="inline-flex min-h-11 items-center gap-1.5 self-start font-semibold text-accent underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden="true" size={16} /> {tripId ? 'Back to trip' : 'All trips'}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-h1 font-extrabold text-brand-hover">{tripId ? 'Edit trip' : 'Plan a trip'}</h1>
        {preview && <SampleDataTag />}
      </div>
      {loading && <Skeleton className="h-72 w-full" />}
      {trips.isError && <ErrorState title="Trips didn't load" error={trips.error} onRetry={() => trips.refetch()} />}
      {trip.isError && <ErrorState title="This trip didn't load" error={trip.error} onRetry={() => trip.refetch()} />}
      {!loading && trips.isSuccess && (!tripId || trip.data) && (
        <TripForm key={tripId || 'new'} initial={trip.data ? { ...EMPTY, ...trip.data } : EMPTY} tripId={tripId} preview={preview} members={memberList} />
      )}
      {!loading && tripId && trip.isSuccess && !trip.data && <ErrorState title="Trip not found" error={{ message: "This trip doesn't exist." }} />}
    </div>
  )
}
