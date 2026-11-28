import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { motion } from 'motion/react'
import { Bell, ChevronUp, LayoutDashboard, LogOut, MapPin, MapPinned, Plane, Settings, Users } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useMotionSafe } from '../../hooks/useMotionSafe'
import { cn } from '../../lib/cn'
import { initialOf } from '../../lib/family'
import { formatCoords, userHome } from '../../lib/geo'
import { PAGE_ENTER } from '../../lib/motion'
import { loadAlertsSeen } from '../../lib/trips'
import { useAlertsFeed } from '../../hooks/useTripsAlerts'
import { Logo } from '../public/Logo'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/family', label: 'Family', icon: Users },
  { to: '/map', label: 'Risk Map', short: 'Map', icon: MapPinned },
  { to: '/trips', label: 'Trips', icon: Plane },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
]
// Mobile tab bar: five destinations; Settings is the gear in the mobile topbar.
const TABS = NAV.filter((n) => ['/dashboard', '/family', '/map', '/trips', '/alerts'].includes(n.to))

/**
 * Topbar bell: number of alerts newer than the last visit to /alerts on this device
 * (first page only, shown as "9+" above 9). Hidden in Preview mode and on errors.
 */
function AlertsBell() {
  const feed = useAlertsFeed(null)
  const first = feed.data?.pages?.[0]
  if (!first || first.preview) return null
  const seen = loadAlertsSeen()
  const count = first.data.items.filter((a) => !seen || a.created_at > seen).length
  return (
    <Link
      to="/alerts"
      className="relative flex size-11 shrink-0 items-center justify-center rounded-pill bg-surface text-ink shadow-card ring-1 ring-line hover:bg-subtle"
      aria-label={count ? `Alerts, ${count} new` : 'Alerts'}
    >
      <Bell aria-hidden="true" size={18} />
      {count > 0 && (
        <span aria-hidden="true" className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-pill bg-danger px-1 text-[0.7rem] font-bold text-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  )
}

function sideClass({ isActive }) {
  return cn(
    'flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-semibold transition-colors',
    isActive ? 'bg-brand text-white shadow-card' : 'text-ink hover:bg-subtle',
  )
}

function Avatar({ name, className }) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft font-bold text-brand-hover', className)}
    >
      {initialOf(name)}
    </span>
  )
}

/** Bottom-of-sidebar user menu (Settings, Log out). Escape and outside clicks close it. */
function UserMenu({ name, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 bottom-full left-0 mb-2 rounded-card border border-line bg-surface p-1.5 shadow-overlay">
          <Link role="menuitem" to="/settings" onClick={() => setOpen(false)} className="flex min-h-10 items-center gap-2 rounded-control px-3 text-sm font-semibold text-ink hover:bg-subtle">
            <Settings aria-hidden="true" size={16} /> Settings
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={onLogout}
            className="flex min-h-10 w-full items-center gap-2 rounded-control px-3 text-sm font-semibold text-ink hover:bg-subtle"
          >
            <LogOut aria-hidden="true" size={16} /> Log out
          </button>
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 w-full items-center gap-3 rounded-control px-2 text-left hover:bg-subtle"
      >
        <Avatar name={name} />
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{name || 'Account'}</span>
        <ChevronUp aria-hidden="true" size={16} className={cn('text-muted transition-transform', !open && 'rotate-180')} />
      </button>
    </div>
  )
}

/**
 * Logged-in app shell (light theme): sidebar on desktop (>= 1024 px), compact topbar +
 * bottom tab bar on mobile. Trips and Alerts fall back to Preview mode until their API exists.
 */
export function AppLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const pageEnter = useMotionSafe(PAGE_ENTER)
  const home = userHome(user)

  return (
    <div className="min-h-dvh lg:pl-64">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-surface px-4 py-2 font-semibold text-ink shadow-raised focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      {/* ---- Desktop sidebar ---- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface/80 px-4 py-5 backdrop-blur lg:flex">
        <Logo to="/dashboard" className="px-2" />
        <nav aria-label="App" className="mt-8 flex-1">
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.label}>
                  <NavLink to={item.to} className={sideClass}>
                    <Icon aria-hidden="true" size={18} />
                    {item.label}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="border-t border-line pt-3">
          <UserMenu name={user?.name} onLogout={logout} />
        </div>
      </aside>

      {/* ---- Topbar ---- */}
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex h-16 items-center justify-between gap-3 px-gutter sm:px-6">
          <Logo to="/dashboard" className="shrink-0 text-lg lg:hidden [&>span]:hidden sm:[&>span]:inline" />
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 items-center gap-2 rounded-pill bg-surface px-3 py-1.5 text-sm shadow-card ring-1 ring-line">
              <MapPin aria-hidden="true" size={16} className="shrink-0 text-accent" />
              <span className="truncate">
                <span className="hidden font-semibold sm:inline">Home: </span>
                <span className="tabular-nums">{home ? formatCoords(home) : 'Not set'}</span>
              </span>
              <Link to="/settings#home-area" className="-my-3 inline-flex min-h-11 shrink-0 items-center font-semibold text-accent underline-offset-4 hover:underline">
                Change<span className="sr-only"> home area</span>
              </Link>
            </div>
            <AlertsBell />
            <Link
              to="/settings"
              className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-surface text-ink shadow-card ring-1 ring-line hover:bg-subtle lg:hidden"
              aria-label="Settings"
            >
              <Settings aria-hidden="true" size={18} />
            </Link>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="px-gutter pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] focus:outline-none sm:px-6 lg:pb-12">
        <motion.div key={location.pathname} className="mx-auto w-full max-w-6xl" {...pageEnter}>
          <Outlet />
        </motion.div>
      </main>

      {/* ---- Mobile bottom tab bar ---- */}
      <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="grid grid-cols-5">
          {TABS.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn('flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold', isActive ? 'text-brand-hover' : 'text-muted')
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={cn('flex h-7 w-12 items-center justify-center rounded-pill', isActive && 'bg-brand-soft')}>
                        <Icon aria-hidden="true" size={20} />
                      </span>
                      {item.short || item.label}
                    </>
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
