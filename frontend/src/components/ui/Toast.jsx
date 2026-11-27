import { useCallback, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { ToastContext } from '../../lib/toast-context'

const TONES = {
  info: { icon: Info, className: 'border-info bg-info-soft', iconClass: 'text-info' },
  success: { icon: CircleCheck, className: 'border-success bg-success-soft', iconClass: 'text-success' },
  error: { icon: CircleAlert, className: 'border-danger bg-danger-soft', iconClass: 'text-danger' },
}
const DURATION_MS = { info: 5000, success: 5000, error: 8000 }
const MAX_TOASTS = 3

/**
 * Toast notifications. Wrap the app in <ToastProvider>, then:
 *   const { toast } = useToast(); toast({ title: 'Saved', tone: 'success' })
 * Announced by screen readers through a polite live region (errors: assertive).
 * Never put tokens, passwords or health details in a toast.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(1)
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
  }, [])

  const toast = useCallback(
    ({ title, description, tone = 'info' }) => {
      const id = nextId.current++
      setToasts((list) => [...list, { id, title, description, tone }].slice(-MAX_TOASTS))
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS[tone] || DURATION_MS.info),
      )
      return id
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastViewport({ toasts, onDismiss }) {
  const reduce = useReducedMotion()
  const motionProps = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 16, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 8, transition: { duration: 0.15 } },
        transition: { type: 'spring', stiffness: 500, damping: 35 },
      }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      aria-live="polite"
      aria-relevant="additions"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const tone = TONES[t.tone] || TONES.info
          const Icon = tone.icon
          return (
            <motion.div
              key={t.id}
              layout={!reduce}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border-l-4 p-4 shadow-overlay',
                tone.className,
              )}
              {...motionProps}
            >
              <Icon aria-hidden="true" size={20} className={cn('mt-0.5 shrink-0', tone.iconClass)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{t.title}</p>
                {t.description && <p className="mt-0.5 text-sm text-ink">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => onDismiss(t.id)}
                className="-m-1 flex size-8 shrink-0 items-center justify-center rounded-control text-muted hover:text-ink"
                aria-label="Dismiss notification"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
