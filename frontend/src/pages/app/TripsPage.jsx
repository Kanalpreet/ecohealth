import { Link } from 'react-router'
import { ArrowRight, CalendarDays, Plane, Plus, Users } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { PreviewLockedButton, SampleDataTag } from '../../components/ui/Preview'
import { Skeleton } from '../../components/ui/Skeleton'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMembers } from '../../hooks/useFamily'
import { travellerName, useTrips } from '../../hooks/useTripsAlerts'
import { formatDateRange, formatElevation, routeSummary } from '../../lib/trips'

/** /trips: trip cards (or Preview sample trips while the backend endpoint is missing). */
export function TripsPage() {
  useDocumentTitle('Trips')
  const trips = useTrips()
  const members = useMembers()
  const preview = trips.data?.preview
  const list = trips.data?.data || []

  const planButton = preview ? (
    <PreviewLockedButton icon={Plus} reason="Not available in this version" className="rounded-pill">
      Plan a trip
    </PreviewLockedButton>
  ) : (
    <Button to="/trips/new" icon={Plus} className="rounded-pill">
      Plan a trip
    </Button>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-h1 font-extrabold text-brand-hover">Trips</h1>
            {preview && <SampleDataTag />}
          </div>
          <p className="mt-1 text-muted">Plan safer travel with altitude, weather and air risks for each traveller.</p>
        </div>
        {trips.isSuccess && planButton}
      </div>

      {trips.isLoading && (
        <div className="grid gap-5 md:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}
      {trips.isError && <ErrorState title="Your trips didn't load" error={trips.error} onRetry={() => trips.refetch()} />}
      {trips.isSuccess && list.length === 0 && (
        <EmptyState icon={Plane} title="No trips yet" description="Plan a trip to see altitude, weather and health risks for each traveller before you go." action={planButton} />
      )}

      {list.length > 0 && (
        <ul className="grid gap-5 md:grid-cols-2">
          {list.map((trip) => (
            <li key={trip.id}>
              <Link
                to={`/trips/${trip.id}`}
                className="flex h-full flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card transition-shadow hover:shadow-raised"
              >
                <h2 className="flex items-center gap-2 text-h3 font-bold text-ink">
                  <Plane aria-hidden="true" size={18} className="text-accent" />
                  {trip.name}
                </h2>
                <p className="flex items-center gap-2 text-sm text-muted">
                  <CalendarDays aria-hidden="true" size={15} /> {formatDateRange(trip.start_date, trip.end_date)}
                </p>
                <p className="text-sm font-semibold text-ink">{routeSummary(trip.stops)}</p>
                <p className="text-xs text-muted">{trip.stops.map((s) => `${s.place} ${formatElevation(s.elevation_m)}`).join(' · ')}</p>
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Users aria-hidden="true" size={15} />
                  {trip.member_ids.map((id) => travellerName(id, members.data, preview)).join(', ') || 'No travellers'}
                </p>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-accent">
                  View trip health plan <ArrowRight aria-hidden="true" size={15} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
