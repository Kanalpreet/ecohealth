import { cn } from '../../lib/cn'

/**
 * Frosted-glass surface: semi-transparent white, backdrop blur, soft shadow, large radius.
 * Use over imagery or the misty canvas. Text on it stays AA because the glass is >= 68%
 * white (and nearly opaque where backdrop-filter is unsupported).
 */
export function GlassCard({ as: Component = 'div', className, children, ...props }) {
  return (
    <Component className={cn('glass rounded-card p-5 sm:p-6', className)} {...props}>
      {children}
    </Component>
  )
}
