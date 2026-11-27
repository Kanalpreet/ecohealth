import { ArrowRight, Leaf } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

/** Simple placeholder: the full landing page is built in F2. */
export function HomePage() {
  useDocumentTitle(null)
  const { status } = useAuth()

  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-8 text-center sm:py-16">
      <span className="flex size-14 items-center justify-center rounded-card bg-brand-soft text-brand">
        <Leaf aria-hidden="true" size={28} />
      </span>
      <h1 className="text-3xl font-bold sm:text-4xl">Climate-health awareness for your whole family</h1>
      <p className="text-base text-muted sm:text-lg">
        EcoHealth turns air pollution, heat, cold, UV and altitude into clear, personal risk awareness for you and the
        people you care about.
      </p>
      <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
        {status === 'authenticated' ? (
          <Button to="/dashboard" icon={ArrowRight}>
            Go to your dashboard
          </Button>
        ) : (
          <>
            <Button to="/register" icon={ArrowRight}>
              Get started
            </Button>
            <Button to="/login" variant="secondary">
              Log in
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
