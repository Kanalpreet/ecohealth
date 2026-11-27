import { useEffect, useState } from 'react'
import { useInView } from 'motion/react'
import { usePrefersReducedMotion } from './useMotionSafe'

/**
 * Step clock for small looping demos (Features page cards).
 * - Advances `step` from 0 to steps-1 every `interval` ms, holds the last step for
 *   `hold` extra ticks, then restarts (loop) or stays on the last step (play once).
 * - Runs only while `ref` is at least 40% on screen: off screen it pauses where it is.
 * - Reduced motion: never runs; returns the final step (the static, complete version).
 * Returns { step, reduce }.
 */
export function useDemoLoop(ref, { steps, interval = 800, hold = 3, loop = true }) {
  const reduce = usePrefersReducedMotion()
  const inView = useInView(ref, { amount: 0.4 })
  const [tick, setTick] = useState(0)
  const total = steps + hold
  const running = inView && !reduce

  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => {
      setTick((t) => {
        if (t + 1 < total) return t + 1
        return loop ? 0 : t
      })
    }, interval)
    return () => clearInterval(id)
  }, [running, interval, total, loop])

  if (reduce) return { step: steps - 1, reduce: true }
  return { step: Math.min(tick, steps - 1), reduce: false }
}
