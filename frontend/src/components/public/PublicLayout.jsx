import { Outlet, useLocation } from 'react-router'
import { motion } from 'motion/react'
import { useMotionSafe } from '../../hooks/useMotionSafe'
import { PAGE_ENTER } from '../../lib/motion'
import { Footer } from './Footer'
import { Navbar } from './Navbar'

const AUTH_PATHS = /^\/(login|register)\/?$/

/** Shell for the public site (/, /features, ..., /login, /register): navbar, page, footer. */
export function PublicLayout() {
  const location = useLocation()
  const enter = useMotionSafe(PAGE_ENTER)
  // /login and /register are one flip card: same key, so switching doesn't replay the page enter.
  const pageKey = AUTH_PATHS.test(location.pathname) ? 'auth' : location.pathname
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-surface px-4 py-2 font-semibold text-ink shadow-raised focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
        {/* Gentle route transition: fade + small rise on every public page change. */}
        <motion.div key={pageKey} className="flex flex-1 flex-col" {...enter}>
          <Outlet />
        </motion.div>
      </main>
      <Footer />
    </div>
  )
}
