import { useEffect, useState } from 'react'
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../services/api'
import { ErrorCode } from '../services/api'

/*
 * Risk data (TanStack Query). Refresh rules (docs/frontend.md):
 *  - refetch when the window regains focus,
 *  - refetch every 30 minutes while the page is open (matches the backend's 30-min cache TTL),
 *  - manual refresh via useRefreshRisk().
 * 409 (no home) and 503 (data unavailable) are not retried automatically.
 */
const THIRTY_MIN = 30 * 60_000
const riskOptions = {
  staleTime: 5 * 60_000,
  refetchOnWindowFocus: true,
  refetchInterval: THIRTY_MIN,
  retry: (count, error) => ![ErrorCode.NO_HOME_LOCATION, ErrorCode.DATA_UNAVAILABLE, ErrorCode.NOT_FOUND].includes(error?.code) && count < 1,
}

export const riskKeys = {
  all: ['risk'],
  family: ['risk', 'family'],
  member: (id) => ['risk', 'member', id],
  hourly: (id) => ['risk', 'hourly', id],
}

export function useFamilyRisk() {
  return useQuery({ queryKey: riskKeys.family, queryFn: api.getFamilyRisk, ...riskOptions })
}

export function useMemberRisk(memberId, { enabled = true } = {}) {
  return useQuery({ queryKey: riskKeys.member(memberId), queryFn: () => api.getMemberRisk(memberId), enabled: Boolean(memberId) && enabled, ...riskOptions })
}

export function useMemberHourly(memberId) {
  return useQuery({ queryKey: riskKeys.hourly(memberId), queryFn: () => api.getMemberHourlyRisk(memberId), enabled: Boolean(memberId), ...riskOptions })
}

/** Manual refresh of every risk query; `refreshing` is true while any risk query fetches. */
export function useRefreshRisk() {
  const qc = useQueryClient()
  const fetching = useIsFetching({ queryKey: riskKeys.all })
  return { refresh: () => qc.invalidateQueries({ queryKey: riskKeys.all }), refreshing: fetching > 0 }
}

/** Current time, updated every `intervalMs` (for "Updated 3 min ago" and the live "now" marker). */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
