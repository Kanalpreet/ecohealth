import { Link } from 'react-router'
import { Logo } from './Logo'

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { to: '/features', label: 'Features' },
      { to: '/how-it-works', label: 'How it Works' },
      { to: '/features#travel-mode', label: 'Travel Mode' },
    ],
  },
  {
    title: 'Company',
    links: [
      { to: '/about', label: 'About' },
      { to: '/privacy', label: 'Privacy' },
      { to: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Account',
    links: [
      { to: '/login', label: 'Log in' },
      { to: '/register', label: 'Sign up' },
    ],
  },
]

const linkClass = 'inline-flex min-h-8 items-center rounded-control text-sm text-muted hover:text-brand-hover hover:underline underline-offset-4'
const externalClass = 'font-semibold text-ink underline decoration-mint-strong underline-offset-4 hover:text-brand-hover'

/** Public-site footer. Data attribution (Open-Meteo is CC BY 4.0) and the disclaimer are required. */
export function Footer() {
  return (
    <footer className="mt-auto border-t border-line bg-surface/70">
      <div className="mx-auto max-w-content px-gutter py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.3fr_2fr]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-3 text-sm text-muted">Personalised climate-health awareness for you and your family.</p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {COLUMNS.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h2 className="text-sm font-bold text-ink">{column.title}</h2>
                <ul className="mt-3 flex flex-col gap-1">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link to={link.to} className={linkClass}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-line pt-6 text-sm text-muted">
          <p>
            Weather and air quality data:{' '}
            <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className={externalClass}>
              Open-Meteo
            </a>{' '}
            (
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className={externalClass}
            >
              CC BY 4.0
            </a>
            ) and{' '}
            <a href="https://openaq.org/" target="_blank" rel="noopener noreferrer" className={externalClass}>
              OpenAQ
            </a>
            .
          </p>
          <p>
            EcoHealth is a climate-health risk-awareness tool, not a diagnostic tool and not medical advice. Always
            consult a qualified healthcare professional for health decisions.
          </p>
          <p>© 2026 EcoHealth</p>
        </div>
      </div>
    </footer>
  )
}
