import { useEffect } from 'react'
import { useRouteError } from 'react-router'
import { ErrorState } from '../components/ui/ErrorState'

/**
 * Shown by the router if a page crashes while rendering. No technical details are
 * shown to people; in development the error is logged to the console for debugging.
 */
export function RouteErrorPage() {
  const error = useRouteError()
  useEffect(() => {
    if (import.meta.env.DEV) console.error('[route error]', error)
  }, [error])
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <ErrorState
        title="Something went wrong"
        error={{ message: 'This page could not be displayed. Please reload and try again.' }}
        onRetry={() => window.location.reload()}
      />
    </div>
  )
}
