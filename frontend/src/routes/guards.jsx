import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { loginPathFor, safeNext } from '../lib/safeNext'
import { PageSpinner } from '../components/ui/Spinner'

/** Pages that need a session. Logged-out visitors go to /login?next=<this page>. */
export function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <PageSpinner label="Checking your session" />
  if (status !== 'authenticated') return <Navigate to={loginPathFor(location)} replace />
  return <Outlet />
}

/** /login and /register: once logged in, continue to a SAFE ?next= path (or the dashboard). */
export function PublicOnlyRoute() {
  const { status } = useAuth()
  const [params] = useSearchParams()
  if (status === 'loading') return <PageSpinner label="Checking your session" />
  if (status === 'authenticated') return <Navigate to={safeNext(params.get('next'))} replace />
  return <Outlet />
}
