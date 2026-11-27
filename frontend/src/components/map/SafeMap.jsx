import { Component, lazy, Suspense } from 'react'
import { Skeleton } from '../ui/Skeleton'
import { MapFallback } from './MapFallback'

// MapLibre (~1 MB) is loaded only when a map is actually shown.
const MapView = lazy(() => import('./MapView'))

/** Catches a failed lazy import (or any map render error) so only the map area changes. */
export class MapErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.error('[map] failed to load or render', error)
  }

  render() {
    if (this.state.error) return this.props.fallback
    return this.props.children
  }
}

/**
 * The map, made safe: lazy-loads MapView, shows a skeleton while loading, and shows
 * MapFallback (coordinate inputs when `onPick` is given) INSIDE the page if the map
 * code can't load or the map can't render. Never crashes the surrounding page.
 * A failed dynamic import stays failed until the page reloads, so "try again" reloads.
 */
export function SafeMap({ point, onPick, className, ...props }) {
  return (
    <MapErrorBoundary
      fallback={<MapFallback point={point} onPick={onPick} onRetry={() => window.location.reload()} className={className} />}
    >
      <Suspense fallback={<Skeleton className={className} />}>
        <MapView point={point} onPick={onPick} className={className} {...props} />
      </Suspense>
    </MapErrorBoundary>
  )
}
