import { Ban, Database, Download, FlaskConical, Scale, Target } from 'lucide-react'
import { PageHeader } from '../../components/public/PageHeader'
import { GlassCard } from '../../components/ui/GlassCard'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { PAGE_DESCRIPTIONS } from '../../lib/seo'

/*
 * Plain-language privacy notice for the PROTOTYPE. Statements match what the backend
 * does today (docs/auth.md, docs/data-model.md): rounded home location, Argon2id
 * password hashes, /me/export and DELETE /me. Review before any public launch.
 */
const SECTIONS = [
  {
    icon: Database,
    title: 'What we collect',
    items: [
      'Your account: name, email and a password (stored only as a secure hash, never as the password itself).',
      "Your family members: name, age, the health conditions you choose to add, a sensitivity setting and their daily routines.",
      'Your home area: rounded to 2 decimal places, about 1 km. We never store your exact location.',
      'Your time zone, so routine times and safe hours are shown in your local time.',
    ],
  },
  {
    icon: Target,
    title: 'Why we collect it',
    items: [
      'To calculate a climate-health risk score for each family member.',
      'To show the safest hours to go outside and check your routines against the forecast.',
      'To send alerts you ask for, when that feature is available.',
    ],
  },
  {
    icon: Ban,
    title: 'What we never do',
    items: [
      'No tracking or advertising cookies, and no third-party analytics.',
      'We do not sell or share your data for advertising.',
      'We never store your exact location or ask for it in the background.',
      'We never put your health details in logs or error messages.',
    ],
  },
  {
    icon: Download,
    title: 'Your control',
    items: [
      'Export all of your data (account, family members and routines) at any time.',
      'Delete your account at any time: this permanently deletes your family members, routines and sessions too.',
      'Change or remove health conditions and routines whenever you like.',
    ],
  },
  {
    icon: Scale,
    title: 'The law we follow',
    items: [
      "EcoHealth aims to follow the principles of India's Digital Personal Data Protection Act, 2023: clear consent, collecting only what is needed for a stated purpose, keeping data accurate and secure, and letting you access and erase it.",
    ],
  },
]

/** /privacy (F2.4). Static, no animation. */
export function PrivacyPage() {
  useDocumentTitle('Privacy', PAGE_DESCRIPTIONS.privacy)
  return (
    <>
      <PageHeader
        title="Your privacy, in plain language."
        subtitle="What EcoHealth collects, why, and how you stay in control."
      />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-gutter pb-section sm:px-6">
        <div role="note" className="flex items-start gap-3 rounded-card bg-risk-moderate p-4 text-risk-moderate-ink ring-1 ring-risk-moderate-ink/20 ring-inset">
          <FlaskConical aria-hidden="true" size={20} className="mt-0.5 shrink-0" />
          <p className="text-sm">
            <span className="font-bold">Project prototype notice.</span> EcoHealth is a final-year B.Tech project, not a
            commercial service. This page describes how the prototype handles data; it is not a legal document.
          </p>
        </div>
        {SECTIONS.map(({ icon: Icon, title, items }) => (
          <GlassCard as="section" key={title} aria-label={title}>
            <h2 className="flex items-center gap-3 text-h3 font-bold">
              <span className="flex size-10 items-center justify-center rounded-pill bg-brand-soft text-accent">
                <Icon aria-hidden="true" size={20} />
              </span>
              {title}
            </h2>
            <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 text-ink marker:text-accent">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </GlassCard>
        ))}
      </div>
    </>
  )
}
