import { createBrowserRouter } from 'react-router'
import { PageSpinner } from '../components/ui/Spinner'
import { ProtectedRoute, PublicOnlyRoute } from './guards'
import { NotFoundPage } from '../pages/NotFoundPage'
import { RouteErrorPage } from '../pages/RouteErrorPage'
import { SectionErrorPage } from '../pages/SectionErrorPage'
import { RootLayout } from './RootLayout'

/*
 * Code splitting: every layout and page is a lazy route, so the first download only holds
 * React, the router, TanStack Query, Motion and the session logic. The public layout, the
 * app shell (with the alerts bell), the form libraries (react-hook-form + zod, used by the
 * login/register forms) and each page arrive as separate chunks. GSAP is imported
 * dynamically by the Home page only; MapLibre and Recharts are lazy inside their pages.
 *
 * Error boundaries: the root errorElement catches a crash in a layout; each section has its
 * own pathless route with an errorElement, so a crashing page shows a friendly message
 * inside the navbar/sidebar instead of a blank app.
 */
const lazyPage = (load, name) => async () => ({ Component: (await load())[name] })

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <PageSpinner />,
    children: [
      {
        lazy: lazyPage(() => import('../components/public/PublicLayout'), 'PublicLayout'),
        children: [
          {
            errorElement: <SectionErrorPage />,
            children: [
              { index: true, lazy: lazyPage(() => import('../pages/HomePage'), 'HomePage') },
              { path: 'features', lazy: lazyPage(() => import('../pages/public/FeaturesPage'), 'FeaturesPage') },
              { path: 'how-it-works', lazy: lazyPage(() => import('../pages/public/HowItWorksPage'), 'HowItWorksPage') },
              { path: 'for-families', lazy: lazyPage(() => import('../pages/public/ForFamiliesPage'), 'ForFamiliesPage') },
              { path: 'about', lazy: lazyPage(() => import('../pages/public/AboutPage'), 'AboutPage') },
              { path: 'privacy', lazy: lazyPage(() => import('../pages/public/PrivacyPage'), 'PrivacyPage') },
              { path: 'contact', lazy: lazyPage(() => import('../pages/public/ContactPage'), 'ContactPage') },
              {
                element: <PublicOnlyRoute />,
                children: [
                  {
                    // One flip card for both URLs: this layout stays mounted while the path
                    // changes, so switching turns the card instead of swapping pages.
                    lazy: lazyPage(() => import('../pages/AuthFlipPage'), 'AuthFlipPage'),
                    // The children only define the URLs; AuthFlipPage renders both sides itself.
                    children: [
                      { path: 'login', element: <></> },
                      { path: 'register', element: <></> },
                    ],
                  },
                ],
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
      {
        // Logged-in app. No home location yet -> /onboarding first.
        element: <ProtectedRoute requireHome />,
        children: [
          {
            lazy: lazyPage(() => import('../components/layout/AppLayout'), 'AppLayout'),
            children: [
              {
                errorElement: <SectionErrorPage homeTo="/dashboard" homeLabel="Go to the dashboard" />,
                children: [
                  { path: 'dashboard', lazy: lazyPage(() => import('../pages/DashboardPage'), 'DashboardPage') },
                  { path: 'dashboard/:memberId', lazy: lazyPage(() => import('../pages/app/MemberDetailPage'), 'MemberDetailPage') },
                  { path: 'family', lazy: lazyPage(() => import('../pages/app/FamilyPage'), 'FamilyPage') },
                  { path: 'map', lazy: lazyPage(() => import('../pages/app/MapPage'), 'MapPage') },
                  { path: 'settings', lazy: lazyPage(() => import('../pages/app/SettingsPage'), 'SettingsPage') },
                  { path: 'trips', lazy: lazyPage(() => import('../pages/app/TripsPage'), 'TripsPage') },
                  { path: 'trips/new', lazy: lazyPage(() => import('../pages/app/TripFormPage'), 'TripFormPage') },
                  { path: 'trips/:tripId', lazy: lazyPage(() => import('../pages/app/TripDetailPage'), 'TripDetailPage') },
                  { path: 'trips/:tripId/edit', lazy: lazyPage(() => import('../pages/app/TripFormPage'), 'TripFormPage') },
                  { path: 'alerts', lazy: lazyPage(() => import('../pages/app/AlertsPage'), 'AlertsPage') },
                ],
              },
            ],
          },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: 'onboarding',
            errorElement: <SectionErrorPage homeTo="/dashboard" homeLabel="Go to the dashboard" />,
            lazy: lazyPage(() => import('../pages/app/OnboardingPage'), 'OnboardingPage'),
          },
        ],
      },
    ],
  },
])
