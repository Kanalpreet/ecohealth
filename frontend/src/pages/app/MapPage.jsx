import { MapPinned } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'

/** /map: placeholder until the Risk Map go (F5). */
export function MapPage() {
  useDocumentTitle('Risk Map')
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 font-extrabold text-brand-hover">Risk Map</h1>
        <p className="mt-1 text-muted">Air quality around your area and nearby stations.</p>
      </div>
      <div className="rounded-card border border-line bg-surface shadow-card">
        <EmptyState icon={MapPinned} title="The Risk Map is coming soon" description="You'll see air quality around your home area and nearby monitoring stations here." />
      </div>
    </div>
  )
}
