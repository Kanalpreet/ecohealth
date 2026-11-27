import { Inbox } from 'lucide-react'
import { cn } from '../../lib/cn'

/** "Nothing here yet" panel with an optional action (e.g. a Button). */
export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}>
      <span className="flex size-12 items-center justify-center rounded-pill bg-brand-soft text-brand">
        <Icon aria-hidden="true" size={24} />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action}
    </div>
  )
}
