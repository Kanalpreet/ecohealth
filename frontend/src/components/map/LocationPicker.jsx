import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LocateFixed, MapPin, Search, ShieldCheck } from 'lucide-react'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { formatCoords, roundPoint, timezoneOptions } from '../../lib/geo'
import { searchPlaces } from '../../services/geocoding'
import { controlClasses } from '../../lib/field'
import { cn } from '../../lib/cn'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { Spinner } from '../ui/Spinner'
import { SafeMap } from './SafeMap'

/**
 * Home-area picker used by onboarding and Settings. Controlled:
 *   value: { lat, lon } | null (rounded), onChange(point, placeName?)
 *   timezone, onTimezoneChange
 * Three ways to choose: current location (asked only when clicked), place search
 * (Open-Meteo Geocoding, India first) and clicking the map. Every point is rounded
 * to 2 decimals (~1 km) before it is shown or stored.
 */
export function LocationPicker({ value, onChange, timezone, onTimezoneChange, placeName }) {
  const searchId = useId()
  const [text, setText] = useState('')
  const [geo, setGeo] = useState({ busy: false, error: null })
  const term = useDebouncedValue(text.trim(), 350)

  const search = useQuery({
    queryKey: ['geocode', term],
    queryFn: ({ signal }) => searchPlaces(term, { signal }),
    enabled: term.length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  })

  function locateMe() {
    if (!('geolocation' in navigator)) {
      setGeo({ busy: false, error: "Your browser can't share your location. Search for your area instead." })
      return
    }
    setGeo({ busy: true, error: null })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ busy: false, error: null })
        onChange(roundPoint({ lat: pos.coords.latitude, lon: pos.coords.longitude }), null)
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Search for your area or click the map instead.'
            : "We couldn't get your location. Search for your area or click the map instead."
        setGeo({ busy: false, error: msg })
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    )
  }

  function pickPlace(place) {
    onChange(roundPoint(place), `${place.name}${place.region ? `, ${place.region}` : ''}`)
    if (place.timezone) onTimezoneChange?.(place.timezone)
    setText('')
  }

  const results = search.data || []

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <Button variant="secondary" icon={LocateFixed} loading={geo.busy} onClick={locateMe} className="rounded-pill">
          Use my current location
        </Button>
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            Search for your area
          </label>
          <Search aria-hidden="true" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            id={searchId}
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search for your area (city, locality)"
            autoComplete="off"
            className={cn(controlClasses, 'rounded-pill border-line-strong pl-10')}
          />
        </div>
      </div>

      {geo.error && <Alert>{geo.error}</Alert>}

      {term.length >= 2 && (
        <div aria-live="polite">
          {search.isFetching && <Spinner label="Searching" />}
          {search.isError && <Alert>{search.error.message}</Alert>}
          {!search.isFetching && search.isSuccess && results.length === 0 && (
            <p className="text-sm text-muted">No places found for “{term}”. Try another spelling, or click the map.</p>
          )}
          {results.length > 0 && (
            <ul aria-label="Search results" className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-card border border-line bg-surface p-1.5">
              {results.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    onClick={() => pickPlace(place)}
                    className="flex min-h-11 w-full items-start gap-2 rounded-control px-3 py-2 text-left text-sm hover:bg-subtle"
                  >
                    <MapPin aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-accent" />
                    <span>
                      <span className="font-semibold text-ink">{place.name}</span>
                      {place.region && <span className="text-muted"> · {place.region}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Lazy, and never crashes the page: falls back to coordinate inputs if the map fails. */}
      <SafeMap point={value} onPick={(p) => onChange(p, null)} className="min-h-72 h-72 w-full rounded-card ring-1 ring-line" label="Map: click to set your home area" />


      <div className="flex flex-col gap-4 rounded-card bg-brand-soft p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <MapPin aria-hidden="true" size={18} className="text-accent" />
            {value ? (
              <span>
                Selected: <span className="tabular-nums">{formatCoords(value)}</span>
                {placeName && <span className="font-normal text-muted"> · {placeName}</span>}
              </span>
            ) : (
              'No area selected yet'
            )}
          </p>
          <p className="mt-1 flex items-start gap-2 text-sm text-muted">
            <ShieldCheck aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-accent" />
            Rounded to about 1 km for privacy. We never store your exact location.
          </p>
        </div>
        {onTimezoneChange && (
          <Select
            label="Time zone"
            value={timezone}
            onChange={(e) => onTimezoneChange(e.target.value)}
            options={timezoneOptions(timezone)}
            className="sm:w-64"
          />
        )}
      </div>
    </div>
  )
}
