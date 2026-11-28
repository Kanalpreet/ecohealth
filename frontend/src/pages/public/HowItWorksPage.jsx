import { AgentFlow } from '../../components/how/AgentFlow'
import { StepsRow } from '../../components/how/StepsRow'
import { TrustAndFaq } from '../../components/how/TrustAndFaq'
import { WhyScoreExample } from '../../components/how/WhyScoreExample'
import { CtaBand } from '../../components/public/CtaBand'
import { PageHeader } from '../../components/public/PageHeader'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { PAGE_DESCRIPTIONS } from '../../lib/seo'

/** /how-it-works (F2.3). Lazy-loaded route; GSAP loads inside it on demand (agents flow). */
export function HowItWorksPage() {
  useDocumentTitle('How it Works', PAGE_DESCRIPTIONS.howItWorks)
  return (
    <>
      <PageHeader
        title="Protection in four simple steps."
        subtitle="Set it up once. EcoHealth watches the air and weather for your family every hour."
      />
      <StepsRow />
      <AgentFlow />
      <WhyScoreExample />
      <TrustAndFaq />
      <CtaBand />
    </>
  )
}
