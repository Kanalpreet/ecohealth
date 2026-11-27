import { cn } from '../../lib/cn'

/** Grey placeholder block while content loads. The pulse is switched off under reduced motion. */
export function Skeleton({ className }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-control bg-subtle', className)} />
}
