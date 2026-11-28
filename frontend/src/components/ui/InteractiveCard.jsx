import { useRef, useSyncExternalStore } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { cn } from '../../lib/cn'

const MAX_TILT = 8 // degrees
const SPRING = { stiffness: 260, damping: 22, mass: 0.6 }
const SHEEN_SIZE = 320 // px

// "Fine pointer that can hover" = mouse/trackpad. Tilt only makes sense there.
const FINE_QUERY = '(hover: hover) and (pointer: fine)'
function subscribeFine(callback) {
  const mq = window.matchMedia(FINE_QUERY)
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}
const getFine = () => window.matchMedia(FINE_QUERY).matches
const getFineServer = () => false

/**
 * Card surface with a tactile feel (Motion, transform/opacity only):
 * - desktop (fine pointer): 3D tilt that follows the pointer, max ~8°, plus a soft light sheen;
 * - a short drag that springs back (`drag`): free on mouse, horizontal only on touch
 *   (touch-action: pan-y keeps vertical page scrolling);
 * - a slight press scale.
 * Keyboard use is unaffected (nothing here is focusable or reacts to keys). Under reduced
 * motion it renders a plain element with no effects.
 *
 * Props: `as` (div, article, section, li), `tilt`, `drag`, `press` (all default true).
 */
export function InteractiveCard({ as = 'div', tilt = true, drag = true, press = true, className, children, ...props }) {
  const reduce = useReducedMotion()
  const fine = useSyncExternalStore(subscribeFine, getFine, getFineServer)
  const ref = useRef(null)

  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const rotateX = useSpring(rx, SPRING)
  const rotateY = useSpring(ry, SPRING)
  const sx = useMotionValue(0)
  const sy = useMotionValue(0)
  const sheenOpacity = useSpring(0, { stiffness: 200, damping: 30 })
  const sheenX = useTransform(sx, (v) => v - SHEEN_SIZE / 2)
  const sheenY = useTransform(sy, (v) => v - SHEEN_SIZE / 2)

  if (reduce) {
    const Plain = as
    return (
      <Plain className={className} {...props}>
        {children}
      </Plain>
    )
  }

  const Component = motion[as] || motion.div
  const canTilt = tilt && fine

  function onPointerMove(e) {
    if (!canTilt || e.pointerType !== 'mouse' || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width // 0..1
    const py = (e.clientY - rect.top) / rect.height
    ry.set((px - 0.5) * 2 * MAX_TILT)
    rx.set(-(py - 0.5) * 2 * MAX_TILT)
    sx.set(e.clientX - rect.left)
    sy.set(e.clientY - rect.top)
    sheenOpacity.set(1)
  }
  function onPointerLeave() {
    rx.set(0)
    ry.set(0)
    sheenOpacity.set(0)
  }

  const dragProps = drag
    ? {
        drag: fine ? true : 'x',
        dragConstraints: { top: 0, right: 0, bottom: 0, left: 0 },
        dragElastic: 0.12,
        dragSnapToOrigin: true,
        dragTransition: { bounceStiffness: 420, bounceDamping: 24 },
      }
    : {}

  return (
    <Component
      ref={ref}
      className={cn('relative', className)}
      style={{
        rotateX: canTilt ? rotateX : 0,
        rotateY: canTilt ? rotateY : 0,
        transformPerspective: 900,
        touchAction: 'pan-y',
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      whileTap={press ? { scale: 0.985 } : undefined}
      whileDrag={drag ? { cursor: 'grabbing' } : undefined}
      {...dragProps}
      {...props}
    >
      {children}
      {canTilt && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <motion.span
            className="absolute top-0 left-0 rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.45),transparent)]"
            style={{ width: SHEEN_SIZE, height: SHEEN_SIZE, x: sheenX, y: sheenY, opacity: sheenOpacity }}
          />
        </span>
      )}
    </Component>
  )
}
