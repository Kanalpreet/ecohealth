import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../services/api'
import { AuthContext } from '../lib/auth-context'
import { queryKeys } from '../lib/queryClient'
import { useToast } from '../hooks/useToast'

// Module-level so the session is restored exactly ONCE per page load, even when
// React StrictMode runs effects twice in development (refresh tokens rotate, so a
// second parallel refresh would look like token reuse).
let bootPromise = null

function restoreSession(queryClient) {
  if (!bootPromise) {
    bootPromise = api
      .refreshSession()
      .then(() => queryClient.fetchQuery({ queryKey: queryKeys.me, queryFn: api.getMe }))
      .then(() => ({ ok: true }))
      .catch((error) => ({ ok: false, error }))
  }
  return bootPromise
}

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

/**
 * Holds the session state (docs/frontend.md §3). The access token itself lives
 * only in services/api.js memory; the user object lives in the TanStack Query cache.
 */
export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [status, setStatus] = useState('loading') // 'loading' | 'authenticated' | 'anonymous'

  // 1) On app load: one refresh. 401 just means "not logged in".
  useEffect(() => {
    let active = true
    restoreSession(queryClient).then((result) => {
      if (!active) return
      setStatus(result.ok ? 'authenticated' : 'anonymous')
      if (!result.ok && result.error?.code === api.ErrorCode.NETWORK) {
        toast({ tone: 'error', title: "Can't reach EcoHealth", description: result.error.message })
      }
    })
    return () => {
      active = false
    }
  }, [queryClient, toast])

  // 2) A refresh failed during a retried request: the session is over.
  useEffect(() => {
    api.onSessionExpired(() => {
      queryClient.clear()
      setStatus('anonymous')
      toast({ tone: 'info', title: 'Your session has ended', description: 'Please log in again.' })
    })
    return () => api.onSessionExpired(null)
  }, [queryClient, toast])

  const meQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: api.getMe,
    enabled: status === 'authenticated',
  })

  const login = useCallback(
    async ({ email, password }) => {
      await api.login({ email, password })
      await queryClient.fetchQuery({ queryKey: queryKeys.me, queryFn: api.getMe, staleTime: 0 })
      setStatus('authenticated')
    },
    [queryClient],
  )

  const register = useCallback(
    async ({ name, email, password }) => {
      const body = { name, email, password, consent: true, timezone: browserTimezone() }
      try {
        await api.register(body)
      } catch (error) {
        // Some browsers report time zone aliases the backend may not accept:
        // fall back to the backend default (editable later in settings).
        if (error?.code === api.ErrorCode.VALIDATION && error.fieldErrors?.timezone && body.timezone) {
          await api.register({ ...body, timezone: undefined })
        } else {
          throw error
        }
      }
      await login({ email, password })
    },
    [login],
  )

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      // Even if the server can't be reached, forget the session locally.
    }
    queryClient.clear()
    setStatus('anonymous')
  }, [queryClient])

  const value = useMemo(
    () => ({ status, user: meQuery.data ?? null, login, register, logout }),
    [status, meQuery.data, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
