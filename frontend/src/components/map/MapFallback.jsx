import { useId, useState } from 'react'
import { MapPinOff, RotateCcw } from 'lucide-react'
import { formatCoords, roundPoint } from '../../lib/geo'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'

/**
 * Shown INSIDE the page when the map can't be used (the map code didn't load, WebGL is
 * unavailable, or the base map failed to load). With `onPick`, people can still type
 * their coordinates; the point is rounded to 2 decimals (~1 km) like every other input.
 * Without `onPick` (read-only previews) it just shows the coordinates.
 */
export function MapFallback({ point, onPick, onRetry, className }) {
  const latId = useId()
  const lonId = useId()
  const [lat, setLat] = useState(point ? String(point.lat) : '')
  const [lon, setLon] = useState(point ? String(point.lon) : '')
  const [error, setError] = useState(null)

  function apply(event) {
    event.preventDefault()
    const la = Number(lat)
    const lo = Number(lon)
    if (lat.trim() === '' || lon.trim() === '' || !Number.isFinite(la) || !Number.isFinite(lo)) {
      setError('Enter both latitude and longitude as numbers, for example 28.61 and 77.21.')
      return
    }
    if (la < -90 || la > 90 || lo < -180 || lo > 180) {
      setError('Latitude must be between -90 and 90, and longitude between -180 and 180.')
      return
    }
    setError(null)
    onPick(roundPoint({ lat: la, lon: lo }))
  }

  const input =
    'block w-full min-h-11 rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink tabular-nums focus-visible:border-focus focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/40'

  return (
    <div role="region" aria-label="Map unavailable" className={cn('flex flex-col gap-3 rounded-card bg-subtle p-5 ring-1 ring-line ring-inset', className)}>
      <p className="flex items-start gap-2 text-sm text-ink">
        <MapPinOff aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-muted" />
        <span>
          The map can't be shown right now.
          {onPick
            ? ' You can still search for your area, use your current location, or enter coordinates below.'
            : point
              ? ` Your home area is ${formatCoords(point)}.`
              : ''}
        </span>
      </p>
      {onPick && (
        <form onSubmit={apply} noValidate className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={latId} className="text-sm font-semibold text-ink">
              Latitude
            </label>
            <input id={latId} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="28.61" className={input} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={lonId} className="text-sm font-semibold text-ink">
              Longitude
            </label>
            <input id={lonId} inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="77.21" className={input} />
          </div>
          <Button type="submit" variant="secondary">
            Use these coordinates
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {onRetry && (
        <div>
          <Button variant="ghost" icon={RotateCcw} onClick={onRetry}>
            Try loading the map again
          </Button>
        </div>
      )}
    </div>
  )
}
