import { useEffect, useId, useRef } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useMotionSafe } from '../../hooks/useMotionSafe'
import { Button } from './Button'

const ENTER = {
  initial: { opacity: 0, scale: 0.97, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  transition: { duration: 0.18, ease: 'easeOut' },
}

/**
 * Accessible modal built on the native <dialog> element: showModal() makes the
 * rest of the page inert, traps focus and closes on Escape for free.
 * Props: open, onClose, title, description?, children, footer?
 */
export function Modal({ open, onClose, title, description, children, footer, className }) {
  const ref = useRef(null)
  const titleId = useId()
  const descId = useId()
  const enter = useMotionSafe(ENTER)

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
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault() // let React state close it, so `open` stays the source of truth
        onClose?.()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose?.() // click on the backdrop
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] max-w-md rounded-card bg-transparent p-0 text-ink',
        className,
      )}
    >
      {open && (
        <motion.div className="rounded-card bg-surface p-5 shadow-overlay sm:p-6" {...enter}>
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="-m-2 flex size-10 shrink-0 items-center justify-center rounded-control text-muted hover:text-ink"
              aria-label="Close"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          {description && (
            <p id={descId} className="mt-2 text-sm text-muted">
              {description}
            </p>
          )}
          {children && <div className="mt-4">{children}</div>}
          {footer && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
        </motion.div>
      )}
    </dialog>
  )
}

/** Yes/no confirmation built on Modal. `danger` styles the confirm button red. */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}
