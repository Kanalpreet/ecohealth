import { useReducedMotion } from 'motion/react'

/**
 * Returns Motion props only when the user has NOT asked for reduced motion.
 * Usage: <motion.div {...useMotionSafe({ initial, animate, exit, transition })} />
 * Under prefers-reduced-motion the element simply renders with no animation.
 */
export function useMotionSafe(props) {
  const reduce = useReducedMotion()
  return reduce ? {} : props
}

export function usePrefersReducedMotion() {
  return Boolean(useReducedMotion())
}
