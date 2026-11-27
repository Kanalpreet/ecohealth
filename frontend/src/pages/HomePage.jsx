import { CtaBand } from '../components/public/CtaBand'
import { FeatureRow } from '../components/home/FeatureRow'
import { HomeHero } from '../components/home/HomeHero'
import { ModeCards } from '../components/home/ModeCards'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

/** Public Home page (F2.1). Lazy-loaded route; GSAP/Lottie load inside it on demand. */
export function HomePage() {
  useDocumentTitle(null)
  return (
    <>
      <HomeHero />
      <FeatureRow />
      <ModeCards />
      <CtaBand />
    </>
  )
}
