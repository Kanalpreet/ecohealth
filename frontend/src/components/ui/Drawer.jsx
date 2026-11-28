import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * Side panel on desktop (right edge), bottom sheet on mobile. Built on the native
 * <dialog> + showModal(): focus is trapped inside, the page behind is inert, and
 * Escape closes it. Props: open, onClose, title, description?, children, footer?
 */
export function Drawer({ open, onClose, title, description, children, footer, className }) {
  const ref = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault()
        onClose?.()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose?.() // backdrop click
      }}
      className={cn(
        // Mobile: bottom sheet. sm and up: full-height panel on the right.
        'mx-0 mt-auto mb-0 max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-panel bg-surface p-0 text-ink shadow-overlay',
        'sm:my-0 sm:mr-0 sm:ml-auto sm:h-dvh sm:max-h-dvh sm:w-[28rem] sm:rounded-none sm:rounded-l-panel',
        className,
      )}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col sm:h-dvh sm:max-h-dvh">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
            <div>
              <h2 id={titleId} className="text-lg font-bold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-control text-muted hover:text-ink"
              aria-label="Close"
            >
              <X aria-hidden="true" size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          {footer && <div className="flex gap-2 border-t border-line px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}
