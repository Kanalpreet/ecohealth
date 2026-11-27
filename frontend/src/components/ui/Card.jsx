import { motion } from 'motion/react'
import { cn } from '../../lib/cn'
import { useMotionSafe } from '../../hooks/useMotionSafe'

const HOVER = { whileHover: { y: -2 }, transition: { type: 'spring', stiffness: 400, damping: 30 } }

/**
 * Surface for grouped content. `interactive` adds a subtle lift on hover
 * (skipped under reduced motion). `as` picks the element: div, section, article, li.
 */
export function Card({ as = 'div', interactive = false, className, children, ...props }) {
  const Component = motion[as] || motion.div
  const hover = useMotionSafe(HOVER)
  return (
    <Component
      className={cn(
        'rounded-card border border-line bg-surface p-5 shadow-card sm:p-6',
        interactive && 'transition-shadow hover:shadow-raised',
        className,
      )}
      {...(interactive ? hover : {})}
      {...props}
    >
      {children}
    </Component>
  )
}

export function CardTitle({ as: Heading = 'h2', className, children }) {
  return <Heading className={cn('text-lg font-semibold', className)}>{children}</Heading>
}
