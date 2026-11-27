import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { RouterProvider } from 'react-router'
import { AuthProvider } from './components/AuthProvider'
import { ToastProvider } from './components/ui/Toast'
import { queryClient } from './lib/queryClient'
import { router } from './routes/router'

/**
 * Provider order: server data -> motion settings -> toasts -> session -> routes.
 * MotionConfig reducedMotion="user" makes every Motion animation respect the
 * operating-system "reduce motion" setting.
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ToastProvider>
      </MotionConfig>
    </QueryClientProvider>
  )
}
