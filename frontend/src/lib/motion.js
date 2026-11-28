/**
 * Shared Motion presets. Every page (public site, app, onboarding) enters the same way:
 * a short fade with a small rise (transform + opacity only). Use with useMotionSafe(),
 * which drops them under prefers-reduced-motion.
 */
export const PAGE_ENTER = Object.freeze({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
})
