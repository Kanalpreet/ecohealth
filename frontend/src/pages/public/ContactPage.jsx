import { Code2, ExternalLink, Mail } from 'lucide-react'
import { PageHeader } from '../../components/public/PageHeader'
import { GlassCard } from '../../components/ui/GlassCard'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { CONTACT_EMAIL, GITHUB_URL } from '../../lib/siteConfig'

const rowLink =
  'flex min-h-14 items-center gap-4 rounded-card p-3 text-ink ring-1 ring-line ring-inset transition-colors hover:bg-brand-soft'

/** /contact (F2.4). Email and GitHub only, no form. Values live in lib/siteConfig.js. */
export function ContactPage() {
  useDocumentTitle('Contact')
  return (
    <>
      <PageHeader pill="Contact" title="Get in touch." subtitle="Questions, feedback or ideas about EcoHealth? We'd love to hear from you." />
      <div className="mx-auto w-full max-w-xl px-gutter pb-section sm:px-6">
        <GlassCard className="flex flex-col gap-3">
          <a href={`mailto:${CONTACT_EMAIL}`} className={rowLink}>
            <span className="flex size-11 items-center justify-center rounded-pill bg-brand-soft text-accent">
              <Mail aria-hidden="true" size={22} />
            </span>
            <span>
              <span className="block text-sm text-muted">Email</span>
              <span className="font-semibold break-all">{CONTACT_EMAIL}</span>
            </span>
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={rowLink}>
            <span className="flex size-11 items-center justify-center rounded-pill bg-brand-soft text-accent">
              <Code2 aria-hidden="true" size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-muted">Source code on GitHub</span>
              <span className="font-semibold break-all">{GITHUB_URL.replace('https://', '')}</span>
            </span>
            <ExternalLink aria-hidden="true" size={16} className="shrink-0 text-muted" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <p className="mt-2 text-sm text-muted">
            For health concerns, please contact a qualified healthcare professional. EcoHealth cannot give medical advice.
          </p>
        </GlassCard>
      </div>
    </>
  )
}
