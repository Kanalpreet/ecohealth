import { CircleAlert, Info } from 'lucide-react'
import { cn } from '../../lib/cn'

/** Inline message box, e.g. a form-level error. tone: 'error' | 'info'. */
export function Alert({ tone = 'error', title, children, className }) {
  const Icon = tone === 'error' ? CircleAlert : Info
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-control border-l-4 p-3 text-sm text-ink',
        tone === 'error' ? 'border-danger bg-danger-soft' : 'border-info bg-info-soft',
        className,
      )}
    >
      <Icon aria-hidden="true" size={18} className={cn('mt-0.5 shrink-0', tone === 'error' ? 'text-danger' : 'text-info')} />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  )
}
