import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PAGE_DESCRIPTIONS } from '../lib/seo'
import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'

const FLIP = { type: 'spring', duration: 0.7, bounce: 0.22 } // smooth, slight overshoot and settle
const RESIZE = { type: 'spring', duration: 0.7, bounce: 0 } // height: same timing, no overshoot
const FADE = { duration: 0.2, ease: 'easeOut' }
const FADE_MS = 200

/**
 * /login and /register as the two sides of ONE card: Login on the front, Register on the
 * back. This component is the route layout for both paths, so it stays mounted while the
 * URL changes, and the card turns (rotateY 0° ↔ 180°) on every switch: in-page links, the
 * navbar buttons and browser back/forward alike.
 *
 * Sizing: both sides are positioned absolutely, so the hidden one never affects layout.
 * Each side's natural height is measured (ResizeObserver) and the card takes the VISIBLE
 * side's height; during a switch the height animates to the other side's, in time with the
 * turn. The card is centred in the screen space below the navbar, at least 32 px from it;
 * a side taller than the screen simply makes the page scroll.
 *
 * - The 3D context (perspective, preserve-3d, the back side's 180° turn) exists only WHILE
 *   a turn runs (`data-flipping="turn"`, CSS in index.css). At rest the card is flat, so
 *   text stays sharp, and the hidden side is `visibility: hidden`.
 * - Opening a URL directly shows the right side with no animation.
 * - Only the visible side is reachable: the hidden one is `inert` and `aria-hidden`.
 * - After a switch, focus moves to the new side's heading; each side has its own title.
 * - Reduced motion: no 3D turn, a quick crossfade (and height change) instead.
 */
export function AuthFlipPage() {
  const { pathname } = useLocation()
  const side = pathname === '/register' ? 'register' : 'login'
  const onRegister = side === 'register'
  const reduce = useReducedMotion()
  const rotate = useMotionValue(0)
  const height = useMotionValue('auto')
  const sceneRef = useRef(null)
  const cardRef = useRef(null)
  const loginFace = useRef(null)
  const registerFace = useRef(null)
  const loginTitle = useRef(null)
  const registerTitle = useRef(null)
  const sideRef = useRef(side) // the side the card shows (or is turning to)
  const previous = useRef(side)

  useDocumentTitle(onRegister ? 'Create account' : 'Log in', PAGE_DESCRIPTIONS[side])

  // Follow the visible side's natural height while at rest (fonts loading, error messages
  // appearing, window resizing). During a switch the height animation owns the value.
  useLayoutEffect(() => {
    const scene = sceneRef.current
    const measure = (name) => (name === 'login' ? loginFace : registerFace).current?.offsetHeight || 0
    height.set(measure(sideRef.current))
    const observer = new ResizeObserver(() => {
      if (!scene.dataset.flipping) height.set(measure(sideRef.current))
    })
    observer.observe(loginFace.current)
    observer.observe(registerFace.current)
    return () => observer.disconnect()
  }, [height])

  // Layout effect + direct style writes: the side swap (aria-hidden/inert, rendered below) and
  // the start of the 3D turn land in the same frame, so the target side never flashes flat.
  useLayoutEffect(() => {
    if (previous.current === side) return undefined
    previous.current = side
    sideRef.current = side
    const scene = sceneRef.current
    const card = cardRef.current
    const targetHeight = (side === 'register' ? registerFace : loginFace).current.offsetHeight
    const heading = side === 'register' ? registerTitle : loginTitle
    const finish = () => {
      card.style.transform = 'none'
      rotate.set(0)
      delete scene.dataset.flipping
      height.set((side === 'register' ? registerFace : loginFace).current.offsetHeight)
      heading.current?.focus({ preventScroll: true })
    }

    if (reduce) {
      scene.dataset.flipping = 'fade' // both sides visible while they crossfade
      const resize = animate(height, targetHeight, FADE)
      const timer = setTimeout(finish, FADE_MS)
      return () => {
        resize.stop()
        clearTimeout(timer)
      }
    }

    // The register side is the back: during a turn the card shows it at 180°. If a turn is
    // already running (quick double switch), continue from the current angle and height.
    const turning = scene.dataset.flipping === 'turn'
    scene.dataset.flipping = 'turn'
    if (!turning) {
      const start = side === 'register' ? 0 : 180
      rotate.set(start)
      card.style.transform = `rotateY(${start}deg)`
    }
    const resize = animate(height, targetHeight, RESIZE)
    const turn = animate(rotate, side === 'register' ? 180 : 0, { ...FLIP, onComplete: finish })
    return () => {
      resize.stop()
      turn.stop()
    }
  }, [side, reduce, rotate, height])

  return (
    <div
      ref={sceneRef}
      className="auth-flip mx-auto flex min-h-[calc(100svh-4.5rem)] w-full max-w-5xl flex-col justify-center px-gutter py-8 sm:px-6 sm:py-10"
    >
      <motion.div ref={cardRef} className="auth-flip-card relative" style={{ rotateY: rotate, height }}>
        <motion.div
          ref={loginFace}
          className="auth-flip-face"
          inert={onRegister}
          aria-hidden={onRegister || undefined}
          initial={false}
          animate={{ opacity: reduce && onRegister ? 0 : 1 }}
          transition={FADE}
        >
          <LoginPage active={!onRegister} titleRef={loginTitle} />
        </motion.div>

        <motion.div
          ref={registerFace}
          className="auth-flip-face auth-flip-back"
          inert={!onRegister}
          aria-hidden={!onRegister || undefined}
          initial={false}
          animate={{ opacity: reduce && !onRegister ? 0 : 1 }}
          transition={FADE}
        >
          <RegisterPage active={onRegister} titleRef={registerTitle} />
        </motion.div>
      </motion.div>
    </div>
  )
}
