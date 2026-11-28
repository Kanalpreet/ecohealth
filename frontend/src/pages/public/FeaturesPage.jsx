import { ComparisonTable } from '../../components/features/ComparisonTable'
import { FeatureGrid } from '../../components/features/FeatureGrid'
import { TravelPreview } from '../../components/features/TravelPreview'
import { CtaBand } from '../../components/public/CtaBand'
import { PageHeader } from '../../components/public/PageHeader'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { PAGE_DESCRIPTIONS } from '../../lib/seo'

/** /features (F2.2). Lazy-loaded route; uses Motion only (no GSAP/Lottie). */
export function FeaturesPage() {
  useDocumentTitle('Features', PAGE_DESCRIPTIONS.features)
  return (
    <>
      <PageHeader
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
