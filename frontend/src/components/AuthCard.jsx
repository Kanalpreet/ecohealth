import { Card } from './ui/Card'

/** Centered card used by /login and /register. */
export function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto w-full max-w-md">
      <Card as="section" aria-labelledby="auth-title">
        <h1 id="auth-title" className="text-2xl font-bold">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </Card>
      {footer && <p className="mt-6 text-center text-sm text-muted">{footer}</p>}
    </div>
  )
}
