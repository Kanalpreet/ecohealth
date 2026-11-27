import { Compass } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle('Page not found')
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="The page you were looking for doesn't exist or has moved."
      action={<Button to="/">Back to home</Button>}
    />
  )
}
