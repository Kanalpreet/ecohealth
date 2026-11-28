import { useEffect } from 'react'
import { Link, useRouteError } from 'react-router'
import { ErrorState } from '../components/ui/ErrorState'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

// A lazy page chunk that can't be fetched usually means a new version was deployed.
const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|error loading dynamically imported/i

/**
 * Error boundary for one section of the site (a page inside the public layout or the app
 * shell). The navbar / sidebar stay usable; only the broken page shows this message.
 * No technical details are shown to people; in development the error goes to the console.
 */
export function SectionErrorPage({ homeTo = '/', homeLabel = 'Go to the home page' }) {
  const error = useRouteError()
  useDocumentTitle('Something went wrong')
  useEffect(() => {
    if (import.meta.env.DEV) console.error('[section error]', error)
  }, [error])
  const outdated = CHUNK_ERROR.test(String(error?.message || ''))

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-gutter py-12">
      <ErrorState
        title={outdated ? 'EcoHealth was updated' : 'This part of the page could not be shown'}
        error={{
          message: outdated
            ? 'A newer version is available. Reload to continue.'
            : 'Something went wrong while showing this page. The rest of EcoHealth still works: try again, or go somewhere else.',
        }}
        onRetry={() => window.location.reload()}
        className="w-full"
      />
      <Link to={homeTo} className="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-4 hover:underline">
        {homeLabel}
      </Link>
    </div>
  )
}
