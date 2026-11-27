import { useEffect, useRef, useState } from 'react'
import { AttributionControl, Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { Crosshair, Minus, Plus } from 'lucide-react'
import { usePrefersReducedMotion } from '../../hooks/useMotionSafe'
import { circlePolygon, INDIA_CENTER } from '../../lib/geo'
import { cn } from '../../lib/cn'

setWorkerUrl(workerUrl) // see MapView.jsx: MapLibre v6 computes its worker URL at runtime

/*
 * Risk Map (MapLibre; load lazily, behind MapErrorBoundary). OpenFreeMap "positron" base
 * map (© OpenStreetMap contributors, © OpenMapTiles), attribution always shown, plus the
 * air data credit.
 *  - home: rounded { lat, lon }; a pin and a ~1 km privacy circle tinted by the CURRENT AIR
 *    category (CPCB colour), never by a person's risk level.
 *  - Signature fly-in: the map glides from India to the home area, then the circle gently
 *    expands. Reduced motion: jump straight to the final view.
 *  - Accessible HTML controls: zoom in, zoom out, recenter on home.
 *  - If the map can't start (no WebGL), the base map fails, or nothing loads in 15 s,
 *    `fallback` is rendered instead (same information as text).
 */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
const HOME_ZOOM = 13.5 // the 1 km circle is ~80 px across at this zoom
const LOAD_TIMEOUT_MS = 15_000

export default function RiskMap({ home, tint = '#475569', className, fallback = null, label = 'Map of your home area' }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const homeRef = useRef(home)
  const tintRef = useRef(tint)
  const reduce = usePrefersReducedMotion()
  const reduceRef = useRef(reduce)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    tintRef.current = tint
    const map = mapRef.current
    if (map?.getLayer('privacy-fill')) {
      map.setPaintProperty('privacy-fill', 'fill-color', tint)
      map.setPaintProperty('privacy-line', 'line-color', tint)
    }
  }, [tint])

  useEffect(() => {
    let map = null
    let loaded = false
    let disposed = false
    let raf = 0
    const target = homeRef.current

    const fail = (reason) => {
      if (disposed) return
      if (import.meta.env.DEV) console.warn('[risk map] showing fallback:', reason)
      disposed = true
      cancelAnimationFrame(raf)
      map?.remove()
      mapRef.current = null
      setFailed(true)
    }

    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: STYLE_URL,
        center: reduceRef.current ? [target.lon, target.lat] : [INDIA_CENTER.lon, INDIA_CENTER.lat],
        zoom: reduceRef.current ? HOME_ZOOM : 3.6,
        attributionControl: false,
      })
    } catch (error) {
      queueMicrotask(() => fail(error))
      return () => {
        disposed = true
      }
    }
    mapRef.current = map
    map.addControl(new AttributionControl({ compact: false, customAttribution: 'Air quality: Open-Meteo, OpenAQ' }), 'bottom-right')

    const timer = setTimeout(() => !loaded && fail('timeout'), LOAD_TIMEOUT_MS)
    map.on('error', (e) => !loaded && fail(e?.error || 'map error before load'))

    // Circle grows from 15% to 100% of the 1 km radius (canvas layer data, ~0.9 s).
    const expandCircle = () => {
      const source = map.getSource('privacy')
      if (!source) return
      if (reduceRef.current) {
        source.setData(circlePolygon(target, 1))
        return
      }
      const start = performance.now()
      const step = (now) => {
        const t = Math.min(1, (now - start) / 900)
        const eased = 1 - Math.pow(1 - t, 3)
        source.setData(circlePolygon(target, 0.15 + 0.85 * eased))
        map.setPaintProperty('privacy-fill', 'fill-opacity', 0.22 * eased)
        if (t < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }

    map.on('load', () => {
      loaded = true
      clearTimeout(timer)
      map.addSource('privacy', { type: 'geojson', data: circlePolygon(target, reduceRef.current ? 1 : 0.15) })
      map.addLayer({
        id: 'privacy-fill',
        type: 'fill',
        source: 'privacy',
        paint: { 'fill-color': tintRef.current, 'fill-opacity': reduceRef.current ? 0.22 : 0 },
      })
      map.addLayer({ id: 'privacy-line', type: 'line', source: 'privacy', paint: { 'line-color': tintRef.current, 'line-width': 2, 'line-opacity': 0.7 } })
      new Marker({ color: '#14532d' }).setLngLat([target.lon, target.lat]).addTo(map)

      if (reduceRef.current) return
      map.once('moveend', expandCircle)
      map.flyTo({ center: [target.lon, target.lat], zoom: HOME_ZOOM, duration: 2400, curve: 1.4, essential: false })
    })

    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
      if (!disposed) {
        disposed = true
        map.remove()
      }
      mapRef.current = null
    }
  }, [])

  function recenter() {
    const map = mapRef.current
    const h = homeRef.current
    if (!map || !h) return
    const camera = { center: [h.lon, h.lat], zoom: HOME_ZOOM }
    if (reduceRef.current) map.jumpTo(camera)
    else map.easeTo({ ...camera, duration: 700 })
  }

  if (failed) return fallback

  const btn =
    'flex size-11 items-center justify-center bg-surface text-ink hover:bg-subtle focus-visible:z-10 disabled:opacity-50'
  return (
    <div className={cn('relative overflow-hidden rounded-card', className)}>
      {/* h-full/w-full, not absolute: MapLibre's CSS sets .maplibregl-map { position: relative }. */}
      <div ref={containerRef} role="region" aria-label={label} className="h-full w-full" />
      <div className="absolute top-3 right-3 flex flex-col overflow-hidden rounded-control shadow-raised ring-1 ring-line">
        <button type="button" className={btn} onClick={() => mapRef.current?.zoomIn({ animate: !reduceRef.current })} aria-label="Zoom in">
          <Plus aria-hidden="true" size={18} />
        </button>
        <button type="button" className={cn(btn, 'border-y border-line')} onClick={() => mapRef.current?.zoomOut({ animate: !reduceRef.current })} aria-label="Zoom out">
          <Minus aria-hidden="true" size={18} />
        </button>
        <button type="button" className={btn} onClick={recenter} aria-label="Recenter on home">
          <Crosshair aria-hidden="true" size={18} />
        </button>
      </div>
    </div>
  )
}
