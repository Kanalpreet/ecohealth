import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../services/api'
import { isNotImplemented } from '../services/api'
import { PREVIEW_MEMBERS, PREVIEW_PLANS, PREVIEW_TRIPS, previewAlertsPage, previewTripSummaries } from '../lib/previewData'

/*
 * Trips and Alerts data with automatic Preview mode (docs/frontend.md "Preview mode").
 * Each feature probes ONE endpoint that can only 404 when it doesn't exist
 * (GET /trips, GET /alerts, GET /me/alert-settings). 404/501 -> { preview: true } plus
 * sample data from lib/previewData.js; anything else is real data. When the backend adds
 * an endpoint, the real data is used with no code change.
 */
const PREVIEW_RECHECK = 5 * 60_000 // look for the real endpoint again every 5 minutes

export const tripKeys = {
  list: ['trips'],
  detail: (id) => ['trips', id],
  plan: (id) => ['trips', id, 'plan'],
}
export const alertKeys = {
  feed: (type) => ['alerts', type || 'all'],
  settings: ['alert-settings'],
}

async function orPreview(call, preview) {
  try {
    return { preview: false, data: await call() }
  } catch (error) {
    if (isNotImplemented(error)) return { preview: true, data: preview() }
    throw error
  }
}

/** { preview, data: TripSummary[] } */
export function useTrips() {
  return useQuery({
    queryKey: tripKeys.list,
    queryFn: () => orPreview(api.listTrips, previewTripSummaries),
    staleTime: PREVIEW_RECHECK,
  })
}

/** Trip by id. In preview the sample trip is used (real ids never look like "preview-…"). */
export function useTrip(id, { preview }) {
  return useQuery({
    queryKey: tripKeys.detail(id),
    queryFn: () => (preview ? PREVIEW_TRIPS.find((t) => t.id === id) || null : api.getTrip(id)),
    enabled: Boolean(id) && preview !== undefined,
  })
}

export function useTripPlan(id, { preview }) {
  return useQuery({
    queryKey: tripKeys.plan(id),
    queryFn: () => (preview ? PREVIEW_PLANS[id] || null : api.getTripPlan(id)),
    enabled: Boolean(id) && preview !== undefined,
  })
}

export function useTripMutations() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: tripKeys.list })
  return {
    create: useMutation({ mutationFn: api.createTrip, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, changes }) => api.updateTrip(id, changes),
      onSuccess: (_d, { id }) => {
        qc.invalidateQueries({ queryKey: tripKeys.detail(id) })
        refresh()
      },
    }),
    remove: useMutation({ mutationFn: api.deleteTrip, onSuccess: refresh }),
  }
}

/** Members to show on trips: the user's real members, or the sample travellers in preview. */
export function travellerName(memberId, members, preview) {
  const list = preview ? PREVIEW_MEMBERS : members || []
  return list.find((m) => m.id === memberId)?.name || 'Removed member'
}

/** Infinite alert feed for one filter. Pages: { preview, data: { items, next_cursor } }. */
export function useAlertsFeed(type) {
  return useInfiniteQuery({
    queryKey: alertKeys.feed(type),
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      orPreview(
        () => api.listAlerts({ type, cursor: pageParam }),
        () => previewAlertsPage({ type, cursor: pageParam }),
      ),
    getNextPageParam: (last) => last.data.next_cursor || undefined,
    staleTime: 60_000,
  })
}

export function useAlertFeedback() {
  return useMutation({ mutationFn: ({ id, useful }) => api.sendAlertFeedback(id, useful) })
}

/** { preview, data: settings | null } */
export function useAlertSettings() {
  return useQuery({
    queryKey: alertKeys.settings,
    queryFn: () => orPreview(api.getAlertSettings, () => null),
    staleTime: PREVIEW_RECHECK,
  })
}

export function useUpdateAlertSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.updateAlertSettings,
    onSuccess: (data) => qc.setQueryData(alertKeys.settings, { preview: false, data }),
  })
}
