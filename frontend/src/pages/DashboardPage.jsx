import { useState } from 'react'
import { LogOut, Users } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card, CardTitle } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { RiskBadge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/Skeleton'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { RISK_LEVELS } from '../lib/risk'

/** Protected placeholder (F1). The real family dashboard comes in a later go. */
export function DashboardPage() {
  useDocumentTitle('Dashboard')
  const { user, logout } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    await logout() // ProtectedRoute then redirects to /login
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand">Dashboard</p>
          {user ? (
            <h1 className="mt-1 text-2xl font-bold break-words sm:text-3xl">Hello, {user.name}</h1>
          ) : (
            <Skeleton className="mt-2 h-8 w-48" />
          )}
        </div>
        <Button variant="secondary" icon={LogOut} onClick={handleLogout} loading={loggingOut}>
          Log out
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card as="section" className="md:col-span-2">
          <EmptyState
            icon={Users}
            title="Your family dashboard is coming soon"
            description="Soon you'll add family members and routines here and see today's climate-health risk for each of them."
          />
        </Card>

        <Card as="section" interactive aria-labelledby="levels-title">
          <CardTitle as="h2">
            <span id="levels-title">Risk levels</span>
          </CardTitle>
          <p className="mt-1 text-sm text-muted">Every level is shown with a label and an icon, not just a colour.</p>
          <ul className="mt-4 flex flex-col gap-2">
            {RISK_LEVELS.map((level) => (
              <li key={level.name}>
                <RiskBadge level={level.name} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
