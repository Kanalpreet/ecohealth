import { lazy, Suspense, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ArrowRight, ArrowUpFromDot, CalendarDays, Check, ExternalLink, Hospital, Info, ListChecks, MapPin, Pencil, Phone, Plane, Trash2, TriangleAlert, Users } from 'lucide-react'
import { MapErrorBoundary } from '../../components/map/SafeMap'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { ConfirmDialog } from '../../components/ui/Modal'
import { PreviewBanner, PreviewLockedButton } from '../../components/ui/Preview'
import { RiskBadge } from '../../components/ui/RiskBadge'
import { Skeleton } from '../../components/ui/Skeleton'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMembers } from '../../hooks/useFamily'
import { useNow } from '../../hooks/useRisk'
import { useToast } from '../../hooks/useToast'
import { travellerName, useTrip, useTripMutations, useTripPlan, useTrips } from '../../hooks/useTripsAlerts'
import { timeAgo } from '../../lib/riskFormat'
import { formatDateRange, formatElevation, loadChecklist, saveChecklist, tripTypeLabel } from '../../lib/trips'

const RouteMap = lazy(() => import('../../components/map/RouteMap'))

function Card({ title, icon: Icon, children, className }) {
  return (
    <section className={`rounded-card border border-line bg-surface p-5 shadow-card sm:p-6 ${className || ''}`}>
      <h2 className="flex items-center gap-2 text-h3 font-bold text-ink">
        {Icon && <Icon aria-hidden="true" size={20} className="text-accent" />}
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** Packing checklist; ticks are saved on this device per trip (localStorage). */
function Checklist({ tripId, items }) {
  const [ticks, setTicks] = useState(() => loadChecklist(tripId))
  const toggle = (item) => {
    const next = { ...ticks, [item]: !ticks[item] }
    setTicks(next)
    saveChecklist(tripId, next)
  }
  if (!items.length) return <p className="text-sm text-muted">No packing items for this trip.</p>
  const done = items.filter((i) => ticks[i]).length
  return (
    <>
      <p className="mb-2 text-sm text-muted">
        {done} of {items.length} packed · saved on this device
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {items.map((item) => (
          <li key={item}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5 text-sm text-ink has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus">
              <input type="checkbox" className="sr-only" checked={Boolean(ticks[item])} onChange={() => toggle(item)} />
              <span aria-hidden="true" className={`flex size-5 shrink-0 items-center justify-center rounded-md ring-2 ring-inset ${ticks[item] ? 'bg-brand text-white ring-brand' : 'ring-mint-strong'}`}>
                {ticks[item] && <Check size={14} strokeWidth={3} />}
              </span>
              <span className={ticks[item] ? 'text-muted line-through' : ''}>{item}</span>
            </label>
          </li>
        ))}
      </ul>
    </>
  )
}

/** /trips/:tripId: Trip Health Plan (or Preview sample). */
export function TripDetailPage() {
  const { tripId } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const now = useNow(60_000)
  const trips = useTrips()
  const preview = trips.data?.preview
  const members = useMembers()
  const trip = useTrip(tripId, { preview })
  const plan = useTripPlan(tripId, { preview })
  const m = useTripMutations()
  const [confirm, setConfirm] = useState(false)
  useDocumentTitle(trip.data?.name || 'Trip')

  const t = trip.data
  const p = plan.data
  const name = (id) => travellerName(id, members.data, preview)

  async function remove() {
    try {
      await m.remove.mutateAsync(tripId)
      toast({ tone: 'success', title: 'Trip deleted' })
      navigate('/trips')
    } catch (error) {
      toast({ tone: 'error', title: "Couldn't delete the trip", description: error.message })
      setConfirm(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/trips" className="inline-flex min-h-11 items-center gap-1.5 self-start font-semibold text-accent underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden="true" size={16} /> All trips
      </Link>
      {preview && <PreviewBanner feature="Trips" />}
      {(trips.isLoading || trip.isLoading) && <Skeleton className="h-40 w-full" />}
      {(trips.isError || trip.isError) && (
        <ErrorState title={trip.error?.code === 'not_found' ? 'Trip not found' : "This trip didn't load"} error={trips.error || trip.error} onRetry={() => trip.refetch()} />
      )}
      {trip.isSuccess && !t && <ErrorState title="Trip not found" error={{ message: "This trip doesn't exist." }} />}

      {t && (
        <>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="flex items-center gap-3 text-h1 font-extrabold text-brand-hover">
                <Plane aria-hidden="true" size={28} className="shrink-0" /> {t.name}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
                <span className="flex items-center gap-1.5">
                  <CalendarDays aria-hidden="true" size={16} /> {formatDateRange(t.start_date, t.end_date)}
                </span>
                <span>{tripTypeLabel(t.trip_type)}</span>
                <span className="flex items-center gap-1.5">
                  <Users aria-hidden="true" size={16} /> {t.member_ids.map(name).join(', ')}
                </span>
              </p>
            </div>
            <div className="flex gap-2">
              {preview ? (
                <>
                  <PreviewLockedButton icon={Pencil} reason="Preview: editing trips is coming soon">
                    Edit
                  </PreviewLockedButton>
                  <PreviewLockedButton icon={Trash2} reason="Preview: deleting trips is coming soon">
                    Delete
                  </PreviewLockedButton>
                </>
              ) : (
                <>
                  <Button variant="secondary" icon={Pencil} to={`/trips/${tripId}/edit`}>
                    Edit
                  </Button>
                  <Button variant="secondary" icon={Trash2} onClick={() => setConfirm(true)} className="text-danger">
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Route strip with elevations */}
          <section aria-label="Route" className="rounded-card border border-line bg-surface p-5 shadow-card">
            <ol className="flex flex-wrap items-center gap-2">
              {t.stops.map((s, i) => (
                <li key={`${s.place}-${i}`} className="flex items-center gap-2">
                  <span className="flex flex-col rounded-control bg-brand-soft px-3 py-2">
                    <span className="flex items-center gap-1.5 font-semibold text-ink">
                      <MapPin aria-hidden="true" size={14} className="text-accent" /> {s.place}
                    </span>
                    <span className="text-xs text-muted tabular-nums">{formatElevation(s.elevation_m ?? p?.stops?.[i]?.elevation_m)}</span>
                  </span>
                  {i < t.stops.length - 1 && <ArrowRight aria-label="then" size={16} className="text-muted" />}
                </li>
              ))}
            </ol>
            {t.stops.some((s) => typeof s.lat === 'number') && (
              <MapErrorBoundary fallback={null}>
                <Suspense fallback={<Skeleton className="mt-4 h-64 w-full" />}>
                  <RouteMap stops={t.stops.filter((s) => typeof s.lat === 'number')} className="mt-4 h-64 w-full ring-1 ring-line" />
                </Suspense>
              </MapErrorBoundary>
            )}
          </section>

          {plan.isLoading && <Skeleton className="h-48 w-full" />}
          {plan.isError && <ErrorState title="The trip health plan didn't load" error={plan.error} onRetry={() => plan.refetch()} />}
          {plan.isSuccess && !p && <p className="text-sm text-muted">No health plan is available for this trip yet.</p>}

          {p && (
            <>
              {p.warnings.length > 0 && (
                <div role="alert" className="flex flex-col gap-1 rounded-card bg-danger-soft p-4 ring-1 ring-danger/25 ring-inset">
                  {p.warnings.map((w) => (
                    <p key={w} className="flex items-start gap-2 font-semibold text-danger">
                      <TriangleAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0" /> {w}
                    </p>
                  ))}
                </div>
              )}
              {p.acclimatisation_notes.length > 0 && (
                <div className="flex flex-col gap-1 rounded-card bg-brand-soft p-4 ring-1 ring-mint ring-inset">
                  {p.acclimatisation_notes.map((n) => (
                    <p key={n} className="flex items-start gap-2 font-semibold text-brand-hover">
                      <Info aria-hidden="true" size={18} className="mt-0.5 shrink-0" /> {n}
                    </p>
                  ))}
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Traveller risk" icon={Users}>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {p.travellers.map((tr) => (
                      <li key={tr.member_id} className="flex items-center justify-between gap-2 rounded-card bg-subtle p-3 ring-1 ring-line ring-inset">
                        <span className="font-semibold text-ink">{name(tr.member_id)}</span>
                        <RiskBadge level={tr.level} score={tr.score} size="sm" />
                      </li>
                    ))}
                  </ul>
                  <h3 className="mt-5 text-sm font-bold text-ink">By stop</h3>
                  <ul className="mt-2 flex flex-col gap-2">
                    {p.stops.map((s, i) => (
                      <li key={`${s.place}-${i}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="text-ink">
                          <span className="font-semibold">{s.place}</span> · {formatElevation(s.elevation_m)}
                          {typeof s.altitude_gain_m === 'number' && (
                            <span className="text-muted">
                              {' '}
                              <ArrowUpFromDot aria-hidden="true" size={12} className="inline" /> +{Math.round(s.altitude_gain_m).toLocaleString('en-US')} m
                            </span>
                          )}
                          {s.key_risks.length > 0 && <span className="text-muted"> · {s.key_risks.join(', ')}</span>}
                        </span>
                        <RiskBadge level={s.level} size="sm" />
                      </li>
                    ))}
                  </ul>
                </Card>

                <Card title="Packing checklist" icon={ListChecks}>
                  <Checklist tripId={tripId} items={p.packing_checklist} />
                </Card>
              </div>

              <Card title="Nearest hospitals" icon={Hospital}>
                {p.hospitals.length === 0 ? (
                  <p className="text-sm text-muted">No hospital information for this trip yet.</p>
                ) : (
                  <ul className="grid gap-3 md:grid-cols-2">
                    {p.hospitals.map((h) => (
                      <li key={h.name} className="flex flex-col gap-2 rounded-card bg-subtle p-4 ring-1 ring-line ring-inset">
                        <p className="font-semibold text-ink">{h.name}</p>
                        <p className="text-sm text-muted">{typeof h.distance_km === 'number' ? `${h.distance_km.toFixed(1)} km away` : 'Distance not available'}</p>
                        {h.phone && (
                          <a href={`tel:${h.phone}`} className="flex items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline">
                            <Phone aria-hidden="true" size={14} /> {h.phone}
                          </a>
                        )}
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${h.lat}&mlon=${h.lon}#map=15/${h.lat}/${h.lon}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-10 items-center gap-1.5 self-start rounded-pill px-3 text-sm font-semibold text-ink ring-1 ring-line-strong/50 hover:bg-surface"
                        >
                          <MapPin aria-hidden="true" size={14} /> View on map
                          <ExternalLink aria-hidden="true" size={13} />
                          <span className="sr-only"> (OpenStreetMap, opens in a new tab)</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <footer className="flex flex-col gap-2 rounded-card bg-subtle p-4 text-sm text-ink ring-1 ring-line ring-inset">
                <p className="text-muted">Plan updated {timeAgo(p.generated_at, now)}.</p>
                <p>{p.disclaimer}</p>
              </footer>
            </>
          )}

          <ConfirmDialog
            open={confirm}
            onCancel={() => setConfirm(false)}
            onConfirm={remove}
            loading={m.remove.isPending}
            danger
            title="Delete this trip?"
            description="The trip and its health plan will be removed."
            confirmLabel="Delete trip"
          />
        </>
      )}
    </div>
  )
}
