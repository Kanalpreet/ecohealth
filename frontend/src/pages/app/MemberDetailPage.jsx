import { lazy, Suspense } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, ArrowUpFromDot, CalendarCheck, Clock, Database, HeartPulse, Snowflake, Sun, Thermometer, ThermometerSun, TriangleAlert, Wind } from 'lucide-react'
import { RiskStatus } from '../../components/dashboard/RiskStatus'
import { AirBadge } from '../../components/ui/AirBadge'
import { Button } from '../../components/ui/Button'
import { CountUp } from '../../components/ui/CountUp'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { FactorBar } from '../../components/ui/FactorBar'
import { RiskBadge } from '../../components/ui/RiskBadge'
import { SafeHoursBar } from '../../components/ui/SafeHoursBar'
import { Skeleton } from '../../components/ui/Skeleton'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMembers } from '../../hooks/useFamily'
import { useMemberHourly, useMemberRisk, useNow } from '../../hooks/useRisk'
import { conditionLabel, initialOf } from '../../lib/family'
import {
  factorLabel,
  formatLocalTime,
  formatNumber,
  formatWindow,
  hasValue,
  hourlyPoints,
  nowIndex,
  NOT_AVAILABLE,
  parseLocal,
  providerLabel,
  safeRanges,
  windowToSegment,
} from '../../lib/riskFormat'
import { ErrorCode } from '../../services/api'

const HourlyChart = lazy(() => import('../../components/dashboard/HourlyChart'))

const FACTOR_ICON = { air_quality: Wind, heat: ThermometerSun, cold: Snowflake, temperature_swing: Thermometer, uv: Sun, altitude: ArrowUpFromDot }
// Neutral factor colours (not the person-risk palette, so a colour never implies a level).
const FACTOR_COLOR = {
  air_quality: 'bg-[#0f766e]',
  heat: 'bg-[#ea580c]',
  cold: 'bg-[#0284c7]',
  temperature_swing: 'bg-[#a16207]',
  uv: 'bg-[#7c3aed]',
  altitude: 'bg-[#475569]',
}

function factorValue(factor, inputs) {
  const basis = inputs.aqi_basis === '24h_mean' ? '24-hour mean' : inputs.aqi_basis === 'hourly' ? 'latest hour' : null
  switch (factor) {
    case 'air_quality':
      return (
        <>
          AQI {formatNumber(inputs.aqi)} <AirBadge category={inputs.aqi_category} size="sm" className="ml-1 align-middle" />{' '}
          <span className="text-muted">
            (PM2.5 {formatNumber(inputs.pm2_5, { unit: ' µg/m³' })}
            {basis ? `, ${basis}` : ''})
          </span>
        </>
      )
    case 'heat':
      return `feels like ${formatNumber(inputs.heat_metric_c, { digits: 1, unit: ' °C' })}`
    case 'cold':
      return `${formatNumber(inputs.temperature_c, { digits: 1, unit: ' °C' })}`
    case 'temperature_swing':
      return `${formatNumber(inputs.temperature_swing_c, { digits: 1, unit: ' °C' })} change over 24 h`
    case 'uv':
      return `UV index ${formatNumber(inputs.uv_index, { digits: 1 })}`
    case 'altitude':
      return `${formatNumber(inputs.elevation_m, { unit: ' m' })}`
    default:
      return NOT_AVAILABLE
  }
}

function ageGroup(age) {
  if (age < 5) return 'Young child (under 5)'
  if (age < 12) return 'Child (5–11)'
  if (age < 65) return 'Adult'
  if (age < 75) return 'Older adult (65–74)'
  return 'Older adult (75+)'
}

function SectionCard({ title, icon: Icon, children, id, action }) {
  return (
    <section aria-labelledby={id} className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="flex items-center gap-2 text-h3 font-bold text-ink">
          {Icon && <Icon aria-hidden="true" size={20} className="text-accent" />}
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** /dashboard/:memberId: score, why, next 24 hours, routines, data sources. */
export function MemberDetailPage() {
  const { memberId } = useParams()
  const members = useMembers()
  const member = members.data?.find((m) => m.id === memberId)
  const risk = useMemberRisk(memberId)
  const hourly = useMemberHourly(memberId)
  const now = useNow(60_000)
  useDocumentTitle(member ? member.name : 'Member')

  const a = risk.data?.assessment
  const inputs = a?.inputs || {}
  const timezone = hourly.data?.timezone || 'Asia/Kolkata'
  const errorCode = risk.error?.code

  if (errorCode === ErrorCode.NOT_FOUND || (members.isSuccess && !member)) {
    return (
      <EmptyState
        title="Member not found"
        description="This family member doesn't exist or was removed."
        action={<Button to="/dashboard">Back to dashboard</Button>}
      />
    )
  }

  const shares = (a?.factors || [])
    .filter((f) => f.contribution_pct > 0)
    .map((f) => ({ id: f.factor, name: factorLabel(f.factor), share: Math.round(f.contribution_pct), className: FACTOR_COLOR[f.factor] || 'bg-[#475569]' }))
  const rows = [
    ...(a?.factors || []).map((f) => ({
      id: f.factor,
      factorId: f.factor,
      icon: FACTOR_ICON[f.factor],
      label: factorLabel(f.factor),
      value: (
        <>
          {factorValue(f.factor, inputs)}
          <span className="text-muted"> · {Math.round(f.contribution_pct)}% of score</span>
        </>
      ),
    })),
    ...(a?.missing_factors || []).map((m) => ({
      id: `missing-${m.factor}`,
      icon: FACTOR_ICON[m.factor],
      label: factorLabel(m.factor),
      value: <span className="text-muted">{NOT_AVAILABLE} ({m.reason})</span>,
    })),
  ]

  const points = hourlyPoints(hourly.data?.hourly)
  const windows = hourly.data?.safe_windows || []
  const firstSegment = windows.length ? windowToSegment(windows[0], timezone) : null
  const multipliers = Object.entries(a?.condition_multipliers || {}).filter(([, x]) => x > 1)

  function suggestion(routine) {
    const occurrence = routine.next_occurrence_utc ? new Date(routine.next_occurrence_utc).getTime() : now
    const next = windows.find((w) => new Date(w.end).getTime() > Math.max(now, occurrence - 12 * 3600_000))
    if (!next) return 'No safe time in the next 24 hours: keep it short or move it indoors.'
    const start = parseLocal(next.start_local)
    const sameDay = start && parseLocal(routine.next_occurrence_local)?.date === start.date
    return `Try ${formatLocalTime(next.start_local)}${sameDay ? '' : ` (${formatWindow(next, timezone).split(' ').pop()})`} instead.`
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/dashboard" className="inline-flex min-h-11 items-center gap-1.5 self-start font-semibold text-accent underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden="true" size={16} /> Dashboard
      </Link>

      {/* ---- Header ---- */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-full bg-brand-soft text-2xl font-extrabold text-brand-hover">
            {initialOf(member?.name)}
          </span>
          <div>
            <h1 className="text-h1 font-extrabold text-ink">{member ? `${member.name}, ${member.age}` : <Skeleton className="h-9 w-48" />}</h1>
            {member && <p className="text-muted">{member.conditions.length ? member.conditions.map(conditionLabel).join(' · ') : 'No known conditions'}</p>}
          </div>
        </div>
        {risk.data && <RiskStatus generatedAt={a.at_time} dataSources={a.data_sources} />}
      </div>

      {risk.isError && errorCode !== ErrorCode.NOT_FOUND && (
        <ErrorState
          title={errorCode === ErrorCode.DATA_UNAVAILABLE ? 'Environmental data is unavailable right now' : errorCode === ErrorCode.NO_HOME_LOCATION ? 'Set your home area first' : "This score didn't load"}
          error={risk.error}
          onRetry={() => risk.refetch()}
        />
      )}
      {risk.isLoading && <Skeleton className="h-32 w-full" />}

      {a && (
        <>
          <div className="flex flex-wrap items-center gap-5 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
            <p className="text-6xl font-extrabold tracking-tight text-ink">
              <CountUp value={a.score} />
              <span className="sr-only"> out of 100</span>
            </p>
            <div className="flex flex-col items-start gap-2">
              <RiskBadge level={a.level} size="lg" />
              <p className="text-muted">
                {a.top_factors.length ? `Mainly due to ${factorLabel(a.top_factors[0]).toLowerCase()}.` : 'No single factor stands out.'}
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            {/* ---- Why this score? ---- */}
            <SectionCard id="why-title" title="Why this score?" icon={HeartPulse}>
              {shares.length ? <FactorBar factors={shares} rows={rows} stagger={0.35} /> : <p className="text-sm text-muted">No factor adds to the score right now.</p>}
              {a.not_applied?.length > 0 && (
                <p className="mt-3 text-xs text-muted">
                  {a.not_applied.map((n) => `${factorLabel(n.factor)}: ${n.reason}`).join(' · ')}
                </p>
              )}
              <div className="mt-4 rounded-card bg-brand-soft p-4 text-sm text-ink">
                <p className="font-semibold">What makes {member?.name || 'them'} more sensitive</p>
                <ul className="mt-2 flex flex-col gap-1">
                  <li>
                    Age group: {member ? ageGroup(member.age) : NOT_AVAILABLE} (×{a.age_modifier})
                  </li>
                  <li>
                    Conditions: {member?.conditions.length ? member.conditions.map(conditionLabel).join(', ') : 'none'}
                    {multipliers.length > 0 && <span className="text-muted"> ({multipliers.map(([f, x]) => `${factorLabel(f).toLowerCase()} ×${x}`).join(', ')})</span>}
                  </li>
                  <li>Sensitivity setting: ×{a.sensitivity}</li>
                </ul>
              </div>
            </SectionCard>

            {/* ---- Next 24 hours ---- */}
            <SectionCard id="hours-title" title="Next 24 hours" icon={CalendarCheck}>
              {hourly.isLoading && <Skeleton className="h-72 w-full" />}
              {hourly.isError && <ErrorState title="The forecast didn't load" error={hourly.error} onRetry={() => hourly.refetch()} />}
              {hourly.data && (
                <>
                  <ul aria-label="Safe windows" className="mb-3 flex flex-wrap gap-2">
                    {windows.length ? (
                      windows.map((w) => (
                        <li key={w.start} className="inline-flex items-center gap-1.5 rounded-pill bg-brand-soft px-3 py-1 text-sm font-semibold text-brand-hover">
                          <CalendarCheck aria-hidden="true" size={14} /> {formatWindow(w, timezone)}
                        </li>
                      ))
                    ) : (
                      <li className="rounded-pill bg-danger-soft px-3 py-1 text-sm font-semibold text-danger">No safe window in the next 24 hours</li>
                    )}
                  </ul>
                  <Suspense fallback={<Skeleton className="h-72 w-full" />}>
                    <HourlyChart points={points} safeRanges={safeRanges(points, windows)} nowIndex={nowIndex(points, now)} />
                  </Suspense>
                  <p className="mt-2 text-xs text-muted">
                    Hourly scores use each hour's air quality, so they can differ from the current score (which uses the 24-hour average).
                  </p>
                  <div className="sr-only">
                  <table>
                    <caption>Hourly risk score for the next 24 hours ({timezone})</caption>
                    <thead>
                      <tr>
                        <th scope="col">Time</th>
                        <th scope="col">Score</th>
                        <th scope="col">Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {points.map((p) => (
                        <tr key={p.time}>
                          <th scope="row">{p.label}</th>
                          <td>{p.score}</td>
                          <td>{p.level}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  <SafeHoursBar
                    className="mt-4"
                    from={0}
                    to={24}
                    tickEvery={6}
                    safe={firstSegment ? [firstSegment] : []}
                    summary={windows.length ? formatWindow(windows[0], timezone) : 'no safe window in the next 24 hours'}
                    liveTimezone={timezone}
                    label="Next safe window"
                  />
                </>
              )}
            </SectionCard>
          </div>

          {/* ---- Routines ---- */}
          <SectionCard id="routines-title" title="Routines" icon={Clock}>
            {hourly.isLoading && <Skeleton className="h-16 w-full" />}
            {hourly.data && hourly.data.routines.length === 0 && (
              <p className="text-sm text-muted">
                No routines yet. <Link to="/family" className="font-semibold text-accent underline-offset-4 hover:underline">Add routines</Link> to check them against the forecast.
              </p>
            )}
            <ul className="flex flex-col gap-3">
              {(hourly.data?.routines || []).map((r, i) => (
                <li
                  key={`${r.activity}-${r.start_time}-${i}`}
                  className={r.status === 'unsafe' ? 'rounded-card bg-danger-soft p-4 ring-1 ring-danger/20 ring-inset' : 'rounded-card bg-subtle p-4 ring-1 ring-line ring-inset'}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-semibold text-ink">
                      {r.status === 'unsafe' && <TriangleAlert aria-hidden="true" size={16} className="text-danger" />}
                      {r.activity} · {r.next_occurrence_local ? `next ${formatLocalTime(r.next_occurrence_local)} ${parseLocal(r.next_occurrence_local)?.date}` : formatLocalTime(`0000-00-00T${r.start_time}`)}
                    </p>
                    {r.level ? <RiskBadge level={r.level} score={r.score} size="sm" /> : <span className="text-sm text-muted">Forecast {NOT_AVAILABLE.toLowerCase()}</span>}
                  </div>
                  {r.status === 'unsafe' && <p className="mt-1 text-sm font-semibold text-danger">Unsafe at this time. {suggestion(r)}</p>}
                  {r.status === 'no_forecast' && <p className="mt-1 text-sm text-muted">The next time is beyond the forecast.</p>}
                </li>
              ))}
            </ul>
          </SectionCard>

          {/* ---- Data sources ---- */}
          <SectionCard id="sources-title" title="Data sources" icon={Database}>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {Object.entries(a.data_sources || {}).map(([key, s]) => (
                <li key={key} className="flex justify-between gap-3 rounded-control bg-subtle px-3 py-2">
                  <span className="text-ink">{providerLabel(key)}</span>
                  <span className="text-muted">
                    {s.source} · {new Date(s.fetched_at).toLocaleString(undefined, { timeZone: timezone, hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
            {a.warnings?.length > 0 && <p className="mt-3 text-sm text-muted">{a.warnings.join(' ')}</p>}
            <p className="mt-3 text-xs text-muted">
              Weather and air quality:{' '}
              <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-4">
                Open-Meteo
              </a>{' '}
              (CC BY 4.0) and{' '}
              <a href="https://openaq.org/" target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-4">
                OpenAQ
              </a>
              . Location shown as a ~5 km grid cell. Engine {a.engine_version}.
            </p>
            {hasValue(risk.data?.disclaimer) && <p className="mt-3 text-sm text-ink">{risk.data.disclaimer}</p>}
          </SectionCard>
        </>
      )}
    </div>
  )
}
