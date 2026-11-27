import { useEffect, useState } from 'react'
import { Bell, Plane, Thermometer, ThumbsDown, ThumbsUp, Users, Wind } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { PreviewBanner } from '../../components/ui/Preview'
import { RiskBadge } from '../../components/ui/RiskBadge'
import { Skeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../hooks/useAuth'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useToast } from '../../hooks/useToast'
import { useAlertFeedback, useAlertsFeed } from '../../hooks/useTripsAlerts'
import { cn } from '../../lib/cn'
import { todayIn } from '../../lib/riskFormat'
import { saveAlertsSeen } from '../../lib/trips'

const FILTERS = [
  { value: null, label: 'All' },
  { value: 'air', label: 'Air quality' },
  { value: 'weather', label: 'Weather' },
  { value: 'family', label: 'Family' },
  { value: 'travel', label: 'Travel' },
]
const TYPE_ICON = { air: Wind, weather: Thermometer, family: Users, travel: Plane }
const TYPE_LABEL = { air: 'Air quality', weather: 'Weather', family: 'Family', travel: 'Travel' }

function dayLabel(iso, timezone) {
  const day = todayIn(timezone, new Date(iso))
  if (day === todayIn(timezone)) return 'Today'
  if (day === todayIn(timezone, new Date(Date.now() - 86_400_000))) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-IN', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short' })
}

function timeLabel(iso, timezone) {
  return new Date(iso).toLocaleTimeString('en-IN', { timeZone: timezone, hour: 'numeric', minute: '2-digit' })
}

function Feedback({ alert, preview }) {
  const { toast } = useToast()
  const send = useAlertFeedback()
  const [given, setGiven] = useState(null)
  const reason = 'Preview: feedback is coming soon'

  async function vote(useful) {
    if (preview) return
    try {
      await send.mutateAsync({ id: alert.id, useful })
      setGiven(useful)
    } catch (error) {
      toast({ tone: 'error', title: "Couldn't send feedback", description: error.message })
    }
  }

  if (given !== null) return <p className="text-xs font-semibold text-accent">Thanks for the feedback</p>
  const btn = 'flex size-9 items-center justify-center rounded-control ring-1 ring-line'
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Was this alert useful?">
      <span className="text-xs text-muted">Useful?</span>
      {[
        { useful: true, icon: ThumbsUp, label: 'Yes, useful' },
        { useful: false, icon: ThumbsDown, label: 'Not useful' },
      ].map(({ useful, icon: Icon, label }) => (
        <button
          key={label}
          type="button"
          aria-disabled={preview || undefined}
          disabled={send.isPending}
          title={preview ? reason : label}
          onClick={() => vote(useful)}
          className={cn(btn, preview ? 'cursor-not-allowed text-muted opacity-60' : 'text-ink hover:bg-subtle')}
        >
          <Icon aria-hidden="true" size={16} />
          <span className="sr-only">
            {label}
            {preview ? ` (${reason})` : ''}
          </span>
        </button>
      ))}
    </div>
  )
}

/** /alerts: alert timeline grouped by day (home time zone), filters, cursor "Load more". */
export function AlertsPage() {
  useDocumentTitle('Alerts')
  const { user } = useAuth()
  const timezone = user?.timezone || 'Asia/Kolkata'
  const [type, setType] = useState(null)
  const feed = useAlertsFeed(type)
  const preview = feed.data?.pages?.[0]?.preview
  const items = feed.data?.pages.flatMap((p) => p.data.items) || []

  // Opening the page marks alerts as seen (topbar bell count), real data only.
  useEffect(() => {
    if (feed.isSuccess && !preview) saveAlertsSeen()
  }, [feed.isSuccess, preview])

  const groups = []
  for (const a of items) {
    const label = dayLabel(a.created_at, timezone)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.items.push(a)
    else groups.push({ label, items: [a] })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 font-extrabold text-brand-hover">Alerts</h1>
        <p className="mt-1 text-muted">Important updates about air, weather and health risks for your family.</p>
      </div>
      {preview && <PreviewBanner feature="Alerts" />}

      <div role="group" aria-label="Filter alerts" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const Icon = TYPE_ICON[f.value]
          const active = type === f.value
          return (
            <button
              key={f.label}
              type="button"
              aria-pressed={active}
              onClick={() => setType(f.value)}
              className={cn(
                'inline-flex min-h-10 items-center gap-1.5 rounded-pill px-4 text-sm font-semibold ring-1 ring-inset',
                active ? 'bg-brand text-white ring-brand' : 'bg-surface text-ink ring-line-strong/40 hover:bg-subtle',
              )}
            >
              {Icon && <Icon aria-hidden="true" size={15} />}
              {f.label}
            </button>
          )
        })}
      </div>

      {feed.isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {feed.isError && <ErrorState title="Alerts didn't load" error={feed.error} onRetry={() => feed.refetch()} />}
      {feed.isSuccess && items.length === 0 && (
        <EmptyState icon={Bell} title="No alerts yet" description="We'll let you know when your family's risk changes." />
      )}

      {groups.map((g) => (
        <section key={g.label} aria-label={g.label} className="flex flex-col gap-3">
          <h2 className="self-start rounded-pill bg-brand-soft px-3 py-1 text-sm font-bold text-brand-hover">{g.label}</h2>
          <ol className="flex flex-col gap-3 border-l-2 border-mint pl-4">
            {g.items.map((a) => {
              const Icon = TYPE_ICON[a.type] || Bell
              return (
                <li key={a.id} className="relative rounded-card border border-line bg-surface p-4 shadow-card">
                  <span aria-hidden="true" className="absolute top-6 -left-[1.4rem] size-2.5 rounded-full bg-brand ring-2 ring-surface" />
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-brand-soft text-accent">
                      <Icon aria-hidden="true" size={18} />
                      <span className="sr-only">{TYPE_LABEL[a.type] || 'Alert'}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-muted">
                          <time dateTime={a.created_at}>{timeLabel(a.created_at, timezone)}</time>
                        </p>
                        {a.level && <RiskBadge level={a.level} size="sm" />}
                      </div>
                      <h3 className="mt-1 font-bold text-ink">{a.title}</h3>
                      <p className="mt-0.5 text-sm text-muted">{a.body}</p>
                      <div className="mt-3">
                        <Feedback alert={a} preview={preview} />
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ))}

      {feed.hasNextPage && (
        <div>
          <Button variant="secondary" onClick={() => feed.fetchNextPage()} loading={feed.isFetchingNextPage}>
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}
