import { useContext } from 'react'
import { ToastContext } from '../lib/toast-context'

/** toast({ title, description?, tone?: 'info'|'success'|'error' }) */
export function useToast() {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside <ToastProvider>')
  return value
}
