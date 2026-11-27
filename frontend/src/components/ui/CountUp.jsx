import { useEffect, useRef } from 'react'
import { animate, motion, useInView, useMotionValue, useTransform } from 'motion/react'
import { usePrefersReducedMotion } from '../../hooks/useMotionSafe'

/**
 * Number that counts up from 0 once it scrolls into view ("2 million", "~30,000", "24/7").
 *   value  : the number to count to
 *   prefix / suffix : text around it ("~", " million", "/7")
 * Screen readers always get the final text (the animated digits are aria-hidden).
 * Reduced motion: the final value at once. Only the text changes; nothing moves.
 */
export function CountUp({ value, prefix = '', suffix = '', duration = 1.2, className }) {
  const ref = useRef(null)
  const reduce = usePrefersReducedMotion()
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const count = useMotionValue(reduce ? value : 0)
  const text = useTransform(count, (v) => Math.round(v).toLocaleString('en-US'))
  const finalText = `${prefix}${value.toLocaleString('en-US')}${suffix}`

  useEffect(() => {
    if (reduce) {
      count.set(value)
      return undefined
    }
    if (!inView) return undefined
    const controls = animate(count, value, { duration, ease: [0.22, 1, 0.36, 1] })
    return () => controls.stop()
  }, [inView, reduce, value, duration, count])

  return (
    <span ref={ref} className={className}>
      <span className="sr-only">{finalText}</span>
      <span aria-hidden="true" className="tabular-nums">
        {prefix}
        <motion.span>{text}</motion.span>
        {suffix}
      </span>
    </span>
  )
}
