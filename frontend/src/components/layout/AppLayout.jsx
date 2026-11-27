import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { motion } from 'motion/react'
import { LayoutDashboard, LogIn, LogOut, Menu, UserPlus, X } from 'lucide-react'
import { LogoMark } from '../public/Logo'
import { useAuth } from '../../hooks/useAuth'
import { useMotionSafe } from '../../hooks/useMotionSafe'
import { cn } from '../../lib/cn'

const PAGE_ENTER = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: 'easeOut' },
}

const linkBase =
  'flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-semibold transition-colors'

function navClass({ isActive }) {
  return cn(linkBase, isActive ? 'bg-brand-soft text-brand-hover' : 'text-muted hover:bg-subtle hover:text-ink')
}

/** Page shell: skip link, header with responsive nav, animated main area, footer. */
export function AppLayout() {
  const { status, logout } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const pageEnter = useMotionSafe(PAGE_ENTER)
  const authed = status === 'authenticated'

  async function handleLogout() {
    setLoggingOut(true)
    await logout()
    setLoggingOut(false)
  }

  const links = authed ? (
    <>
      <NavLink to="/dashboard" className={navClass}>
        <LayoutDashboard aria-hidden="true" size={18} />
        Dashboard
      </NavLink>
      <button type="button" onClick={handleLogout} disabled={loggingOut} className={navClass({ isActive: false })}>
        <LogOut aria-hidden="true" size={18} />
        {loggingOut ? 'Logging out…' : 'Log out'}
      </button>
    </>
  ) : status === 'anonymous' ? (
    <>
      <NavLink to="/login" className={navClass}>
        <LogIn aria-hidden="true" size={18} />
        Log in
      </NavLink>
      <NavLink
        to="/register"
        className={cn(linkBase, 'bg-brand text-white hover:bg-brand-hover')}
      >
        <UserPlus aria-hidden="true" size={18} />
        Sign up
      </NavLink>
    </>
  ) : null

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-surface px-4 py-2 font-semibold text-ink shadow-raised focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <div className="mx-auto flex h-16 max-w-content items-center justify-between gap-3 px-gutter sm:px-6">
          <Link to={authed ? '/dashboard' : '/'} className="flex min-h-11 items-center gap-2 rounded-control font-bold text-ink">
            <LogoMark />
            <span className="text-lg">EcoHealth</span>
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
            {links}
          </nav>

          {links && (
            <button
              type="button"
              className="flex size-11 items-center justify-center rounded-control text-ink hover:bg-subtle sm:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X aria-hidden="true" size={22} /> : <Menu aria-hidden="true" size={22} />}
            </button>
          )}
        </div>

        {menuOpen && (
          // Any click inside (a link or Log out) closes the menu.
          <nav
            id="mobile-nav"
            aria-label="Main mobile"
            onClick={() => setMenuOpen(false)}
            className="flex flex-col gap-1 border-t border-line px-gutter py-3 sm:hidden"
          >
            {links}
          </nav>
        )}
      </header>

      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <motion.div
          key={location.pathname}
          className="mx-auto w-full max-w-content px-gutter py-8 sm:px-6 sm:py-12"
          {...pageEnter}
        >
          <Outlet />
        </motion.div>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-content px-gutter py-6 text-sm text-muted sm:px-6">
          EcoHealth is a climate-health awareness tool, not a diagnostic tool and not medical advice.
        </div>
      </footer>
    </div>
  )
}
