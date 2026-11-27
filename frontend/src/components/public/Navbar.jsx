import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, LayoutDashboard, Menu, X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useMotionSafe } from '../../hooks/useMotionSafe'
import { cn } from '../../lib/cn'
import { Logo } from './Logo'

const PUBLIC_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/features', label: 'Features' },
  { to: '/how-it-works', label: 'How it Works' },
  { to: '/for-families', label: 'For Families' },
  { to: '/about', label: 'About' },
]

const pillBase = 'inline-flex min-h-11 items-center gap-2 rounded-pill px-4 text-sm font-semibold transition-colors'
const primaryPill = cn(pillBase, 'bg-brand text-white shadow-raised hover:bg-brand-hover')
const whitePill = cn(pillBase, 'bg-surface text-ink ring-1 ring-line-strong/40 ring-inset hover:bg-subtle')

function linkClass({ isActive }) {
  return cn(
    'inline-flex min-h-11 items-center rounded-pill px-4 text-sm font-semibold transition-colors',
    isActive ? 'bg-brand-soft text-brand-hover' : 'text-ink hover:bg-surface/70',
  )
}

const MENU_MOTION = {
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.18 },
}

/** Public-site navbar: sticky, glass background after scrolling, hamburger below 1024 px. */
export function Navbar() {
  const { status } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const toggleRef = useRef(null)
  const menuMotion = useMotionSafe(MENU_MOTION)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Escape closes the mobile menu and returns focus to the toggle.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const actions =
    status === 'authenticated' ? (
      <Link to="/dashboard" className={primaryPill}>
        <LayoutDashboard aria-hidden="true" size={18} />
        Go to dashboard
      </Link>
    ) : status === 'anonymous' ? (
      <>
        <Link to="/login" className={whitePill}>
          Log in
        </Link>
        <Link to="/register" className={primaryPill}>
          Sign up
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </>
    ) : null

  return (
    <header className="sticky top-0 z-40">
      {/* Glass layer fades in after scrolling (opacity only). */}
      <div
        aria-hidden="true"
        className={cn(
          'glass pointer-events-none absolute inset-0 rounded-none border-x-0 border-t-0 transition-opacity duration-300',
          scrolled || open ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div className="relative mx-auto flex h-18 max-w-content items-center justify-between gap-4 px-gutter sm:px-6">
        <Logo />

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {PUBLIC_LINKS.map((link) => (
              <li key={link.to}>
                <NavLink to={link.to} end={link.end} className={linkClass}>
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden min-w-[12rem] items-center justify-end gap-2 lg:flex">{actions}</div>

        <button
          ref={toggleRef}
          type="button"
          className="flex size-11 items-center justify-center rounded-pill bg-surface/80 text-ink ring-1 ring-line ring-inset hover:bg-surface lg:hidden"
          aria-expanded={open}
          aria-controls="public-mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" size={22} /> : <Menu aria-hidden="true" size={22} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id="public-mobile-menu"
            className="relative px-gutter pb-4 sm:px-6 lg:hidden"
            onClick={(event) => {
              if (event.target.closest('a')) setOpen(false) // a link was chosen
            }}
            {...menuMotion}
          >
            <nav aria-label="Main mobile" className="glass mx-auto max-w-content rounded-card p-3">
              <ul className="flex flex-col gap-1">
                {PUBLIC_LINKS.map((link) => (
                  <li key={link.to}>
                    <NavLink to={link.to} end={link.end} className={(state) => cn(linkClass(state), 'w-full')}>
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
              {actions && (
                <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2 [&>a]:justify-center">
                  {actions}
                </div>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
