import { Info, Lightbulb, MapPin, Plus, Users } from 'lucide-react'
import { FamilyRiskCard } from '../components/dashboard/FamilyRiskCard'
import { RiskStatus } from '../components/dashboard/RiskStatus'
import { TodayCard } from '../components/dashboard/TodayCard'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { Skeleton } from '../components/ui/Skeleton'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAllRoutines, useMembers } from '../hooks/useFamily'
import { useFamilyRisk, useMemberRisk } from '../hooks/useRisk'
import { userHome } from '../lib/geo'
import { greeting } from '../lib/riskFormat'
import { buildTips } from '../lib/tips'
import { ErrorCode } from '../services/api'

function Disclaimer({ text }) {
  return (
    <p className="flex items-start gap-2 rounded-card bg-subtle p-4 text-sm text-ink ring-1 ring-line ring-inset">
      <Info aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-muted" />
      {text || 'EcoHealth is a risk-awareness tool, not medical advice.'}
    </p>
  )
}

function TipsCard({ tips }) {
  return (
    <section aria-labelledby="tips-title" className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <h2 id="tips-title" className="flex items-center gap-2 text-h3 font-bold text-ink">
        <Lightbulb aria-hidden="true" size={20} className="text-accent" />
        Today's tips
      </h2>
      <p className="mt-1 text-xs text-muted">Simple rules based on today's data.</p>
      {tips.length ? (
        <ul className="mt-4 flex flex-col divide-y divide-line">
          {tips.map((t) => (
            <li key={t.id} className="py-3 text-sm text-ink">
              {t.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">No special precautions from today's data.</p>
      )}
    </section>
  )
}

/** /dashboard: today's air and weather, each member's risk, and rule-based tips. */
export function DashboardPage() {
  useDocumentTitle('Dashboard')
  const { user } = useAuth()
  const members = useMembers()
  const memberList = members.data || []
  const routines = useAllRoutines(memberList)
  const family = useFamilyRisk()
  // Environment values (AQI, PM2.5, temperature, UV) are only in the member assessment;
  // they are the same for everyone, so the first member's assessment is used.
  const firstId = family.data?.members?.[0]?.member_id
  const env = useMemberRisk(firstId, { enabled: Boolean(firstId) })

  const timezone = family.data?.timezone || user?.timezone || 'Asia/Kolkata'
  const cards = family.data?.members || []
  const tips = buildTips({ inputs: env.data?.assessment?.inputs, cards, timezone })
  const errorCode = family.error?.code

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-h1 font-extrabold text-brand-hover">
            {greeting(timezone)}
            {user?.name ? `, ${user.name.split(' ')[0]}` : ''}.
          </h1>
          <p className="mt-1 text-muted">Here's your family's climate-health update for today.</p>
        </div>
        {family.data && <RiskStatus generatedAt={family.data.generated_at} dataSources={family.data.data_sources} />}
      </div>

      {/* ---- Error states ---- */}
      {errorCode === ErrorCode.NO_HOME_LOCATION && (
        <EmptyState
          icon={MapPin}
          title="Set your home area first"
          description="Risk scores need your home area (rounded to about 1 km)."
          action={<Button to="/settings#home-area">Set home area</Button>}
        />
      )}
      {family.isError && errorCode !== ErrorCode.NO_HOME_LOCATION && (
        <ErrorState
          title={errorCode === ErrorCode.DATA_UNAVAILABLE ? 'Environmental data is unavailable right now' : "Today's risk didn't load"}
          error={family.error}
          onRetry={() => family.refetch()}
        />
      )}

      {/* ---- Today ---- */}
      {!family.isError && memberList.length > 0 && (
        <TodayCard inputs={env.data?.assessment?.inputs} loading={family.isLoading || env.isLoading} home={userHome(user)} />
      )}
      {env.isError && <p className="text-sm text-muted">Today's air and weather values didn't load: {env.error.message}</p>}

      {/* ---- Family ---- */}
      <section aria-labelledby="family-title" className="flex flex-col gap-4">
        <h2 id="family-title" className="flex items-center gap-2 text-h3 font-bold text-ink">
          <Users aria-hidden="true" size={20} className="text-accent" />
          Your family
        </h2>

        {(members.isLoading || (family.isLoading && memberList.length > 0)) && (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        )}
        {members.isSuccess && memberList.length === 0 && (
          <EmptyState
            icon={Users}
            title="Add your family to see their risk"
            description="Each person gets their own score based on age and health."
            action={
              <Button to="/family" icon={Plus}>
                Add family members
              </Button>
            }
          />
        )}
        {cards.length > 0 && (
          <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
            <ul className="grid gap-5 md:grid-cols-2">
              {cards.map((card) => (
                <li key={card.member_id}>
                  <FamilyRiskCard
                    card={card}
                    member={memberList.find((m) => m.id === card.member_id)}
                    routines={routines[card.member_id]?.data || []}
                    timezone={timezone}
                  />
                </li>
              ))}
            </ul>
            <TipsCard tips={tips} />
          </div>
        )}
      </section>

      {family.data?.warnings?.length > 0 && (
        <ul className="text-sm text-muted">
          {family.data.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <Disclaimer text={family.data?.disclaimer} />
    </div>
  )
}
