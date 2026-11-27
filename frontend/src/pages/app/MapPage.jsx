import { lazy, Suspense, useId } from 'react'
import { Clock, Droplets, Info, MapPin, Plus, RadioTower, Wind } from 'lucide-react'
import { MapErrorBoundary } from '../../components/map/SafeMap'
import { RiskStatus } from '../../components/dashboard/RiskStatus'
import { AirBadge } from '../../components/ui/AirBadge'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../hooks/useAuth'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMembers } from '../../hooks/useFamily'
import { useFamilyRisk, useMemberRisk, useNow } from '../../hooks/useRisk'
import { aqiCategoryNamed, PM25_BREAKPOINTS } from '../../lib/aqi'
import { cn } from '../../lib/cn'
import { formatCoords, userHome } from '../../lib/geo'
import { formatNumber, hasValue, NOT_AVAILABLE, timeAgo } from '../../lib/riskFormat'
import { ErrorCode } from '../../services/api'

const RiskMap = lazy(() => import('../../components/map/RiskMap'))

const NEUTRAL_TINT = '#475569' // used when the air category is not available

/** "Your area": current air at home (from the risk API) + nearest station (not available yet). */
function AreaCard({ inputs, generatedAt, home, noMembers, className }) {
  const now = useNow(60_000)
  const titleId = useId() // rendered twice (desktop overlay + mobile sheet): ids must stay unique
  const basis = inputs?.aqi_basis === '24h_mean' ? '24-hour average' : inputs?.aqi_basis === 'hourly' ? 'latest hour' : null
  return (
    <section aria-labelledby={titleId} className={cn('glass rounded-card bg-glass-strong p-5', className)}>
      <h2 id={titleId} className="flex items-center gap-2 font-bold text-ink">
        <Wind aria-hidden="true" size={18} className="text-accent" />
        Your area
      </h2>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted tabular-nums">
        <MapPin aria-hidden="true" size={12} /> {formatCoords(home)} (rounded to ~1 km)
      </p>

      {noMembers ? (
        <p className="mt-3 text-sm text-muted">
          Current air quality is shown once you add a family member (today it comes with their risk score).
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <AirBadge category={inputs?.aqi_category} />
            <span className="text-sm font-semibold text-ink tabular-nums">
              AQI {hasValue(inputs?.aqi) ? Math.round(inputs.aqi) : NOT_AVAILABLE}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="flex items-center gap-1.5 text-muted">
              <Droplets aria-hidden="true" size={14} /> PM2.5
            </dt>
            <dd className="font-semibold text-ink tabular-nums">
              {formatNumber(inputs?.pm2_5, { unit: ' µg/m³' })}
              {basis && <span className="font-normal text-muted"> ({basis})</span>}
            </dd>
            <dt className="flex items-center gap-1.5 text-muted">
              <Clock aria-hidden="true" size={14} /> Updated
            </dt>
            <dd className="text-ink">{generatedAt ? timeAgo(generatedAt, now) : NOT_AVAILABLE}</dd>
          </dl>
        </>
      )}

      <div className="mt-3 border-t border-line pt-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <RadioTower aria-hidden="true" size={14} className="text-muted" />
          Nearest station
        </p>
        <p className="mt-0.5 text-sm text-muted">Not available yet: station readings are coming soon.</p>
      </div>
    </section>
  )
}

function Legend({ className }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={cn('glass rounded-card bg-glass-strong p-4', className)}>
      <h2 id={titleId} className="text-sm font-bold text-ink">
        PM2.5 categories (CPCB)
      </h2>
      <p className="text-xs text-muted">24-hour average, µg/m³</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {PM25_BREAKPOINTS.map((b) => {
          const cat = aqiCategoryNamed(b.name)
          return (
            <li key={b.name} className="flex items-center gap-2 text-sm">
              <span aria-hidden="true" className="size-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: cat.hex }} />
              <span className="font-semibold text-ink">{b.name}</span>
              <span className="ml-auto text-muted tabular-nums">{b.range}</span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">Station readings will be hourly and indicative; the area colour uses the CPCB AQI category.</p>
    </section>
  )
}

function StationsToggle() {
  const id = useId()
  return (
    <div className="flex items-center gap-3 opacity-70">
      <span
        id={id}
        role="switch"
        aria-checked="false"
        aria-disabled="true"
        aria-label="Show stations (coming soon)"
        className="relative inline-flex h-6 w-11 cursor-not-allowed rounded-pill bg-line-strong/40"
      >
        <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow-card" />
      </span>
      <span className="text-sm font-semibold text-ink">Show stations</span>
      <Badge>Coming soon</Badge>
    </div>
  )
}

/** Shown instead of the map when the map can't load: the same information as text. */
function MapTextFallback({ home, inputs }) {
  return (
    <div role="region" aria-label="Map unavailable" className="flex h-full min-h-64 flex-col justify-center gap-2 rounded-card bg-subtle p-6 ring-1 ring-line ring-inset">
      <p className="font-semibold text-ink">The map can't be shown right now.</p>
      <p className="text-sm text-ink">
        Your home area: <span className="tabular-nums">{formatCoords(home)}</span> (rounded to about 1 km).
      </p>
      <p className="text-sm text-ink">
        Current air: {inputs?.aqi_category ? <AirBadge category={inputs.aqi_category} size="sm" /> : NOT_AVAILABLE}
        {hasValue(inputs?.aqi) && <span className="tabular-nums"> · AQI {Math.round(inputs.aqi)}</span>}
        {hasValue(inputs?.pm2_5) && <span className="tabular-nums"> · PM2.5 {formatNumber(inputs.pm2_5, { unit: ' µg/m³' })}</span>}
      </p>
      <div>
        <Button variant="ghost" onClick={() => window.location.reload()}>
          Try loading the map again
        </Button>
      </div>
    </div>
  )
}

/** /map: air quality around the home area. Stations are not available from the API yet. */
export function MapPage() {
  useDocumentTitle('Risk Map')
  const { user } = useAuth()
  const home = userHome(user)
  const members = useMembers()
  const family = useFamilyRisk()
  const firstId = family.data?.members?.[0]?.member_id
  const env = useMemberRisk(firstId, { enabled: Boolean(firstId) })
  const inputs = env.data?.assessment?.inputs
  const category = aqiCategoryNamed(inputs?.aqi_category)
  const noMembers = members.isSuccess && (members.data || []).length === 0
  const errorCode = family.error?.code || env.error?.code
  const loading = family.isLoading || (firstId && env.isLoading)

  if (!home || errorCode === ErrorCode.NO_HOME_LOCATION) {
    return (
      <EmptyState
        icon={MapPin}
        title="Set your home area first"
        description="The map centres on your home area (rounded to about 1 km)."
        action={<Button to="/settings#home-area">Set home area</Button>}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-h1 font-extrabold text-brand-hover">Risk Map</h1>
          <p className="mt-1 text-muted">Air quality around your home area</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <StationsToggle />
          {family.data && <RiskStatus generatedAt={family.data.generated_at} dataSources={family.data.data_sources} />}
        </div>
      </div>

      {(family.isError || env.isError) && errorCode !== ErrorCode.NO_HOME_LOCATION && (
        <ErrorState
          title={errorCode === ErrorCode.DATA_UNAVAILABLE ? 'Air quality data is unavailable right now' : "Current air quality didn't load"}
          error={family.error || env.error}
          onRetry={() => (family.isError ? family.refetch() : env.refetch())}
        />
      )}

      {/* Map with floating cards (desktop) / map + bottom sheet (mobile) */}
      <div className="relative">
        <MapErrorBoundary fallback={<MapTextFallback home={home} inputs={inputs} />}>
          <Suspense fallback={<Skeleton className="h-[60dvh] w-full rounded-card md:h-[calc(100dvh-15rem)] md:min-h-[34rem]" />}>
            <RiskMap
              home={home}
              tint={category?.hex || NEUTRAL_TINT}
              className="h-[60dvh] w-full ring-1 ring-line md:h-[calc(100dvh-15rem)] md:min-h-[34rem]"
              fallback={<MapTextFallback home={home} inputs={inputs} />}
              label="Map of your home area with a 1 km privacy circle coloured by the current air quality category"
            />
          </Suspense>
        </MapErrorBoundary>

        {/* Desktop: floating over the map */}
        <div className="pointer-events-none absolute inset-0 hidden p-4 md:block">
          <div className="pointer-events-auto w-80">
            {loading ? <Skeleton className="h-56 w-full rounded-card" /> : <AreaCard inputs={inputs} generatedAt={family.data?.generated_at} home={home} noMembers={noMembers} />}
          </div>
          <div className="pointer-events-auto absolute bottom-10 left-4 w-64">
            <Legend />
          </div>
        </div>
      </div>

      {/* Mobile: bottom sheet below the map, then the legend */}
      {/* No overlap with the map: the tile attribution at its bottom edge must stay visible. */}
      <div className="relative z-10 flex flex-col gap-4 md:hidden">
        <div className="rounded-t-panel bg-surface pt-2 shadow-overlay">
          <div aria-hidden="true" className="mx-auto mb-1 h-1.5 w-12 rounded-pill bg-line-strong/40" />
          {loading ? <Skeleton className="h-56 w-full" /> : <AreaCard inputs={inputs} generatedAt={family.data?.generated_at} home={home} noMembers={noMembers} className="rounded-t-none border-0 shadow-none" />}
        </div>
        <Legend />
      </div>

      {noMembers && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Info aria-hidden="true" size={16} />
          Add a family member to see the current air quality for your area.
          <Button to="/family" variant="ghost" icon={Plus}>
            Add member
          </Button>
        </p>
      )}
    </div>
  )
}
