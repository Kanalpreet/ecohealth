import { useEffect } from 'react'

/** Sets the browser tab title, e.g. "Log in · EcoHealth". */
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · EcoHealth` : 'EcoHealth'
  }, [title])
}
