import { useEffect, useState } from 'react'

/** The value, but only after it has stopped changing for `delay` ms (e.g. search boxes). */
export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
