import { QueryClient } from '@tanstack/react-query'
import { ErrorCode } from '../services/api'

// Errors that retrying won't fix (bad input, not found, rate limited, no home...).
const NO_RETRY = new Set([
  ErrorCode.UNAUTHORIZED,
  ErrorCode.NOT_FOUND,
  ErrorCode.CONFLICT,
  ErrorCode.NO_HOME_LOCATION,
  ErrorCode.VALIDATION,
  ErrorCode.RATE_LIMITED,
])

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => !NO_RETRY.has(error?.code) && failureCount < 2,
    },
    mutations: { retry: false },
  },
})

/** Query keys in one place so cache updates and invalidations stay consistent. */
export const queryKeys = {
  me: ['me'],
}
