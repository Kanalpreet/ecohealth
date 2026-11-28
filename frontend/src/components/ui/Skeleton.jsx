import { cn } from '../../lib/cn'

/**
 * Grey placeholder block while content loads, with a soft light sweep (transform only).
 * Under reduced motion the global CSS rule stops the sweep and the block stays static.
 */
export function Skeleton({ className }) {
  return (
    <span aria-hidden="true" className={cn('relative block overflow-hidden rounded-control bg-subtle', className)}>
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-linear-to-r from-transparent via-white/70 to-transparent" />
    </span>
  )
}
