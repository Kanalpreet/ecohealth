import { Outlet, ScrollRestoration } from 'react-router'

/** Root of every route: scroll to top on new pages, restore on back/forward, scroll to #hash targets. */
export function RootLayout() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}
