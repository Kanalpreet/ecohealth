import { Link } from 'react-router'
import { LoaderCircle } from 'lucide-react'
import { cn } from '../../lib/cn'

const base =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 py-2 text-sm font-semibold ' +
  'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 select-none'

const variants = {
  primary: 'bg-brand text-white hover:bg-brand-hover shadow-card',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-subtle',
  ghost: 'bg-transparent text-ink hover:bg-subtle',
  danger: 'bg-danger text-white hover:brightness-95 shadow-card',
}

/**
 * Button (min 44 px tall: a comfortable touch target).
 * `loading` disables it and shows a spinner; the label stays for screen readers.
 * Pass `to` to render a router Link styled as a button.
 */
export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  icon: Icon,
  to,
  className,
  children,
  type = 'button',
  ...props
}) {
  const classes = cn(base, variants[variant], className)
  const content = (
    <>
      {loading ? (
        <LoaderCircle aria-hidden="true" size={18} className="animate-spin" />
      ) : (
        Icon && <Icon aria-hidden="true" size={18} />
      )}
      {children && <span>{children}</span>}
    </>
  )
  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {content}
      </Link>
    )
  }
  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {content}
    </button>
  )
}
