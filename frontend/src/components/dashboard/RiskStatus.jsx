import { RefreshCw } from 'lucide-react'
import { useNow, useRefreshRisk } from '../../hooks/useRisk'
import { overallSource, providerLabel, SOURCE_TEXT, timeAgo } from '../../lib/riskFormat'
import { cn } from '../../lib/cn'

const DOT = { live: 'bg-success', cache: 'bg-info', stale: 'bg-risk-high-solid' }

/** "Updated 3 min ago · Live data" + manual refresh (spinning icon while any risk query loads). */
export function RiskStatus({ generatedAt, dataSources, className }) {
  const now = useNow(60_000)
  const { refresh, refreshing } = useRefreshRisk()
  const state = overallSource(dataSources)
  const details = Object.entries(dataSources || {})
    .map(([key, s]) => `${providerLabel(key)}: ${s.source}`)
    .join(', ')

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted', className)}>
      <span>Updated {timeAgo(generatedAt, now)}</span>
      {state && (
        <span className="inline-flex items-center gap-1.5" title={details}>
          <span aria-hidden="true" className={cn('size-2 rounded-full', DOT[state])} />
          {SOURCE_TEXT[state]}
          <span className="sr-only"> ({details})</span>
        </span>
      )}
      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-pill px-3 font-semibold text-ink ring-1 ring-line hover:bg-subtle disabled:opacity-70"
      >
        <RefreshCw aria-hidden="true" size={15} className={cn(refreshing && 'animate-spin')} />
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  )
}
