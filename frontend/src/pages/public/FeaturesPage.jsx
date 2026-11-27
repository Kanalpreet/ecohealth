import { ComparisonTable } from '../../components/features/ComparisonTable'
import { FeatureGrid } from '../../components/features/FeatureGrid'
import { TravelPreview } from '../../components/features/TravelPreview'
import { CtaBand } from '../../components/public/CtaBand'
import { PageHeader } from '../../components/public/PageHeader'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'

/** /features (F2.2). Lazy-loaded route; uses Motion only (no GSAP/Lottie). */
export function FeaturesPage() {
  useDocumentTitle('Features')
  return (
    <>
      <PageHeader
        pill="Features"
        title="Everything your family needs to breathe easier."
        subtitle="Personal, preventive and explained – not just another AQI number."
      />
      <FeatureGrid />
      <ComparisonTable />
      <TravelPreview />
      <CtaBand />
    </>
  )
}
