import { Outlet, useLocation } from 'react-router'
import { motion } from 'motion/react'
import { useMotionSafe } from '../../hooks/useMotionSafe'
import { Footer } from './Footer'
import { Navbar } from './Navbar'

const ROUTE_ENTER = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
}

/** Shell for the public site (/, /features, ..., /login, /register): navbar, page, footer. */
export function PublicLayout() {
  const location = useLocation()
  const enter = useMotionSafe(ROUTE_ENTER)
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
        <motion.div key={location.pathname} className="flex flex-1 flex-col" {...enter}>
          <Outlet />
        </motion.div>
      </main>
      <Footer />
    </div>
  )
}
