import { useId } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/cn'

/*
 * EcoHealth mark: "clean air, made visible". A deep-green rounded square with three
 * flowing air lines (two curl like a breeze) and one small mint dot (a clean particle).
 * No nature imagery. Keep public/favicon.svg in sync with this drawing.
 */
export function LogoMark({ className }) {
  const gradientId = `mark-${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={cn('size-8 shrink-0', className)}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="1" y2="0">
          <stop offset="0" stopColor="#14532d" />
          <stop offset="1" stopColor="#1f9150" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <g fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7.5 12.5h10a3 3 0 1 0-3-3" />
        <path d="M7.5 17h15a3 3 0 1 1-3 3" />
        <path d="M7.5 21.5h6.5" strokeOpacity=".75" />
      </g>
      <circle cx="24.5" cy="9" r="1.7" fill="#86d29e" />
    </svg>
  )
}

/** Logo mark + "EcoHealth" word mark, linking home. */
export function Logo({ to = '/', className, inverse = false }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-control text-xl font-extrabold tracking-tight',
        inverse ? 'text-white' : 'text-brand-hover',
        className,
      )}
    >
      <LogoMark />
      <span>EcoHealth</span>
    </Link>
  )
}
