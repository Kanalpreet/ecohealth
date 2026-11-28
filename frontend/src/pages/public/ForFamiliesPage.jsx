import { FlipTiles } from '../../components/families/FlipTiles'
import { PersonaliseAndSetup } from '../../components/families/PersonaliseAndSetup'
import { SameAirCard } from '../../components/families/SameAirCard'
import { CtaBand } from '../../components/public/CtaBand'
import { PageHeader } from '../../components/public/PageHeader'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { PAGE_DESCRIPTIONS } from '../../lib/seo'

/** /for-families (F2.4). Motion only (flip tiles); no GSAP. */
export function ForFamiliesPage() {
  useDocumentTitle('For Families', PAGE_DESCRIPTIONS.forFamilies)
  return (
    <>
      <PageHeader
        title="Built for the people who need it most."
        subtitle="The same air affects everyone differently. EcoHealth protects each person in your family."
      />
      <FlipTiles />
      <SameAirCard />
      <PersonaliseAndSetup />
      <CtaBand />
    </>
  )
}
