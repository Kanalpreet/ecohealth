import { createBrowserRouter } from 'react-router'
import { AppLayout } from '../components/layout/AppLayout'
import { PublicLayout } from '../components/public/PublicLayout'
import { PageSpinner } from '../components/ui/Spinner'
import { ProtectedRoute, PublicOnlyRoute } from './guards'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { RouteErrorPage } from '../pages/RouteErrorPage'
import { RootLayout } from './RootLayout'

// Public marketing pages are lazy-loaded: their code (and GSAP/Lottie, which the
// Home page imports dynamically) never ships in the app's main bundle.
const lazyPage = (load, name) => async () => ({ Component: (await load())[name] })

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <PageSpinner />,
    children: [
      {
        element: <PublicLayout />,
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
              { path: 'login', element: <LoginPage /> },
              { path: 'register', element: <RegisterPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      {
        // Logged-in app. No home location yet -> /onboarding first.
        element: <ProtectedRoute requireHome />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: 'dashboard', lazy: lazyPage(() => import('../pages/DashboardPage'), 'DashboardPage') },
              { path: 'dashboard/:memberId', lazy: lazyPage(() => import('../pages/app/MemberDetailPage'), 'MemberDetailPage') },
              { path: 'family', lazy: lazyPage(() => import('../pages/app/FamilyPage'), 'FamilyPage') },
              { path: 'map', lazy: lazyPage(() => import('../pages/app/MapPage'), 'MapPage') },
              { path: 'settings', lazy: lazyPage(() => import('../pages/app/SettingsPage'), 'SettingsPage') },
            ],
          },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [{ path: 'onboarding', lazy: lazyPage(() => import('../pages/app/OnboardingPage'), 'OnboardingPage') }],
      },
    ],
  },
])
