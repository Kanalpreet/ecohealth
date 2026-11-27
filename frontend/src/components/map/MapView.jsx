import { useEffect, useRef, useState } from 'react'
import { AttributionControl, Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre v6 builds its worker URL at runtime (new URL(name, import.meta.url)), which
// neither Vite's dev pre-bundle nor the production build can follow: the worker file
// would be missing ("Worker failed to load"). Importing it with ?url makes Vite serve it
// in dev and emit it as an asset in the build; we then point MapLibre at it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { MapFallback } from './MapFallback'

setWorkerUrl(workerUrl)
import { usePrefersReducedMotion } from '../../hooks/useMotionSafe'
import { circlePolygon, INDIA_CENTER, roundPoint } from '../../lib/geo'
import { cn } from '../../lib/cn'

/*
 * MapLibre GL JS map. Load it ONLY through SafeMap (React.lazy + error boundary), so this
 * module and maplibre-gl stay in their own chunk and a failure never crashes the page.
 * Base map: OpenFreeMap "positron" style (free, no key; data © OpenStreetMap
 * contributors, © OpenMapTiles). The attribution control is always shown.
 *  - point: { lat, lon } (already rounded) or null
 *  - onPick(point): called with the ROUNDED point when the map is clicked (interactive only)
 * A soft ~1 km circle around the pin shows that the location is rounded for privacy.
 * If the map can't start (no WebGL), the base map fails to load, or nothing has loaded
 * after 15 s, it is removed and MapFallback (coordinate inputs) is shown in its place.
 */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
const EMPTY = { type: 'FeatureCollection', features: [] }
const LOAD_TIMEOUT_MS = 15_000

function circleData(point) {
  return point ? circlePolygon(point, 1) : EMPTY
}

export default function MapView({ point, onPick, interactive = true, zoom = 12, className, label = 'Map' }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const onPickRef = useRef(onPick)
  const pointRef = useRef(point)
  const reduce = usePrefersReducedMotion()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    onPickRef.current = onPick
  }, [onPick])

  // Create the map once (per `interactive` / `zoom`).
  useEffect(() => {
    let map = null
    let loaded = false
    let disposed = false

    const fail = (reason) => {
      if (disposed) return
      if (import.meta.env.DEV) console.warn('[map] showing fallback:', reason)
      disposed = true
      map?.remove()
      mapRef.current = null
      markerRef.current = null
      setFailed(true)
    }

    try {
      const start = pointRef.current || INDIA_CENTER
      map = new MapLibreMap({
        container: containerRef.current,
        style: STYLE_URL,
        center: [start.lon, start.lat],
        zoom: pointRef.current ? zoom : 3.6,
        interactive,
        attributionControl: false,
      })
    } catch (error) {
      // e.g. WebGL not available. Deferred so state isn't set during the effect itself.
      queueMicrotask(() => fail(error))
      return () => {
        disposed = true
      }
    }

    mapRef.current = map
    map.addControl(new AttributionControl({ compact: false }), 'bottom-right')
    if (interactive) map.addControl(new NavigationControl({ showCompass: false }), 'top-right')

    const timer = setTimeout(() => {
      if (!loaded) fail('timeout')
    }, LOAD_TIMEOUT_MS)

    // Errors before the first "load" mean the base map itself is unusable (style or
    // tiles unreachable, WebGL lost). Later tile errors are partial; MapLibre retries.
    map.on('error', (event) => {
      if (!loaded) fail(event?.error || 'map error before load')
    })
    map.on('load', () => {
      loaded = true
      clearTimeout(timer)
      map.addSource('privacy-circle', { type: 'geojson', data: circleData(pointRef.current) })
      map.addLayer({ id: 'privacy-fill', type: 'fill', source: 'privacy-circle', paint: { 'fill-color': '#22a052', 'fill-opacity': 0.16 } })
      map.addLayer({
        id: 'privacy-line',
        type: 'line',
        source: 'privacy-circle',
        paint: { 'line-color': '#15803d', 'line-width': 1.5, 'line-opacity': 0.6 },
      })
    })
    if (interactive) {
      map.on('click', (e) => onPickRef.current?.(roundPoint({ lat: e.lngLat.lat, lon: e.lngLat.lng })))
    }

    return () => {
      clearTimeout(timer)
      if (!disposed) {
        disposed = true
        map.remove()
      }
      mapRef.current = null
      markerRef.current = null
    }
  }, [interactive, zoom])

  // Follow the selected point: pin, circle and camera.
  useEffect(() => {
    pointRef.current = point
    const map = mapRef.current
    if (!map) return
    if (point) {
      if (!markerRef.current) markerRef.current = new Marker({ color: '#166534' })
      markerRef.current.setLngLat([point.lon, point.lat]).addTo(map)
      const camera = { center: [point.lon, point.lat], zoom: Math.max(map.getZoom(), zoom) }
      if (reduce) map.jumpTo(camera)
      else map.easeTo({ ...camera, duration: 600 })
    } else {
      markerRef.current?.remove()
    }
    const source = map.getSource('privacy-circle')
    if (source) source.setData(circleData(point))
  }, [point, zoom, reduce])

  if (failed) {
    return <MapFallback point={point} onPick={interactive ? onPick : undefined} onRetry={() => window.location.reload()} className={className} />
  }
  return <div ref={containerRef} role="region" aria-label={label} className={cn('overflow-hidden rounded-card', className)} />
}
