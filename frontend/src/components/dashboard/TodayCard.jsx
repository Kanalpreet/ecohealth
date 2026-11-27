import { Droplets, Sun, Thermometer, Wind } from 'lucide-react'
import { AirBadge } from '../ui/AirBadge'
import { AqiGauge } from '../ui/AqiGauge'
import { Skeleton } from '../ui/Skeleton'
import { formatCoords } from '../../lib/geo'
import { formatNumber, hasValue, NOT_AVAILABLE } from '../../lib/riskFormat'

function Stat({ icon: Icon, label, value, note }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-brand-soft text-accent">
        <Icon aria-hidden="true" size={18} />
      </span>
      <div className="leading-tight">
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className="text-lg font-bold text-ink tabular-nums">{value}</p>
        {note && <p className="text-xs text-muted">{note}</p>}
      </div>
    </div>
  )
}

/**
 * "Today at home": current air and weather. Values come from the member assessment's
 * `inputs` (environment values, identical for every member of the family); anything
 * missing says "Not available".
 */
export function TodayCard({ inputs, loading, home }) {
  const aqi = inputs?.aqi
  const basis = inputs?.aqi_basis === '24h_mean' ? '24-hour average' : inputs?.aqi_basis === 'hourly' ? 'latest hour' : null
  return (
    <section aria-labelledby="today-title" className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="today-title" className="flex items-center gap-2 text-h3 font-bold text-ink">
          <Wind aria-hidden="true" size={20} className="text-accent" />
          Today at home
        </h2>
        {home && <p className="text-sm text-muted tabular-nums">{formatCoords(home)}</p>}
      </div>

      {loading ? (
        <div className="mt-5 grid gap-6 md:grid-cols-[16rem_1fr]">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="mt-5 grid items-center gap-6 md:grid-cols-[16rem_1fr]">
          <div className="flex flex-col items-center">
            {hasValue(aqi) ? (
              <AqiGauge value={aqi} showBadge={false} />
            ) : (
              <p className="py-8 text-sm text-muted">AQI: {NOT_AVAILABLE}</p>
            )}
            <AirBadge category={inputs?.aqi_category} className="mt-2" />
            {basis && <p className="mt-1 text-xs text-muted">CPCB AQI, {basis}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat icon={Droplets} label="PM2.5" value={formatNumber(inputs?.pm2_5, { unit: ' µg/m³' })} note={basis ? basis : undefined} />
            <Stat
              icon={Thermometer}
              label="Temperature"
              value={formatNumber(inputs?.temperature_c, { unit: ' °C' })}
              note={hasValue(inputs?.heat_metric_c) && inputs.heat_metric_c !== inputs.temperature_c ? `Feels like ${formatNumber(inputs.heat_metric_c, { unit: ' °C' })}` : undefined}
            />
            <Stat icon={Sun} label="UV index" value={formatNumber(inputs?.uv_index, { digits: hasValue(inputs?.uv_index) && inputs.uv_index % 1 ? 1 : 0 })} />
            <Stat
              icon={Thermometer}
              label="Temperature swing (24 h)"
              value={formatNumber(inputs?.temperature_swing_c, { digits: 1, unit: ' °C' })}
            />
          </div>
        </div>
      )}
    </section>
  )
}
