import { useEffect, useRef, useState } from 'react'
import { AttributionControl, LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { usePrefersReducedMotion } from '../../hooks/useMotionSafe'
import { INDIA_CENTER } from '../../lib/geo'
import { cn } from '../../lib/cn'

setWorkerUrl(workerUrl) // see MapView.jsx: MapLibre v6 computes its worker URL at runtime

/*
 * Trip route map (MapLibre; load lazily, behind MapErrorBoundary). Numbered stop markers
 * joined by a dashed line, fitted to the stops. OpenFreeMap tiles, attribution shown.
 * stops: [{ place, lat, lon }] in travel order. Falls back to `fallback` if the map fails.
 */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
const LOAD_TIMEOUT_MS = 15_000

function lineData(stops) {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: stops.map((s) => [s.lon, s.lat]) } }
}

function markerElement(n) {
  const el = document.createElement('div')
  el.className = 'flex size-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-white shadow-raised ring-2 ring-white'
  el.textContent = String(n)
  el.setAttribute('aria-hidden', 'true')
  return el
}

export default function RouteMap({ stops = [], className, fallback = null, label = 'Map of the trip route' }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const reduce = usePrefersReducedMotion()
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let map = null
    let loaded = false
    let disposed = false
    const fail = (reason) => {
      if (disposed) return
      if (import.meta.env.DEV) console.warn('[route map] showing fallback:', reason)
      disposed = true
      map?.remove()
      mapRef.current = null
      setFailed(true)
    }
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: STYLE_URL,
        center: [INDIA_CENTER.lon, INDIA_CENTER.lat],
        zoom: 3.6,
        attributionControl: false,
      })
    } catch (error) {
      queueMicrotask(() => fail(error))
      return () => {
        disposed = true
      }
    }
    mapRef.current = map
    map.addControl(new AttributionControl({ compact: false }), 'bottom-right')
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    const timer = setTimeout(() => !loaded && fail('timeout'), LOAD_TIMEOUT_MS)
    map.on('error', (e) => !loaded && fail(e?.error || 'map error before load'))
    map.on('load', () => {
      loaded = true
      clearTimeout(timer)
      map.addSource('route', { type: 'geojson', data: lineData([]) })
      map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#166534', 'line-width': 2.5, 'line-dasharray': [2, 1.5] } })
      setReady(true)
    })
    return () => {
      clearTimeout(timer)
      if (!disposed) {
        disposed = true
        map.remove()
      }
      mapRef.current = null
    }
  }, [])

  // Draw stops whenever they change.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = stops.map((s, i) => new Marker({ element: markerElement(i + 1) }).setLngLat([s.lon, s.lat]).addTo(map))
    map.getSource('route')?.setData(lineData(stops))
    if (stops.length === 1) {
      map.jumpTo({ center: [stops[0].lon, stops[0].lat], zoom: 9 })
    } else if (stops.length > 1) {
      const bounds = stops.reduce((b, s) => b.extend([s.lon, s.lat]), new LngLatBounds([stops[0].lon, stops[0].lat], [stops[0].lon, stops[0].lat]))
      map.fitBounds(bounds, { padding: 48, maxZoom: 10, duration: reduce ? 0 : 700 })
    }
  }, [stops, ready, reduce])

  if (failed) return fallback
  return <div ref={containerRef} role="region" aria-label={label} className={cn('overflow-hidden rounded-card', className)} />
}
