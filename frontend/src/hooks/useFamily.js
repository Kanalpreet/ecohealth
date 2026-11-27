import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../services/api'
import { queryKeys } from '../lib/queryClient'

/*
 * Server state for family members and routines (TanStack Query). Every call goes
 * through services/api.js. Mutations invalidate the affected lists so the UI updates.
 */
export const familyKeys = {
  members: ['members'],
  routines: (memberId) => ['members', memberId, 'routines'],
}

export function useMembers() {
  return useQuery({ queryKey: familyKeys.members, queryFn: api.listMembers })
}

/** Routines for every member, one query each (max 10 members). Returns a map id -> query. */
export function useAllRoutines(members = []) {
  const results = useQueries({
    queries: members.map((m) => ({ queryKey: familyKeys.routines(m.id), queryFn: () => api.listRoutines(m.id) })),
  })
  return Object.fromEntries(members.map((m, i) => [m.id, results[i]]))
}

export function useRoutines(memberId) {
  return useQuery({
    queryKey: familyKeys.routines(memberId),
    queryFn: () => api.listRoutines(memberId),
    enabled: Boolean(memberId),
  })
}

export function useMemberMutations() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: familyKeys.members })
  return {
    create: useMutation({ mutationFn: api.createMember, onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ id, changes }) => api.updateMember(id, changes), onSuccess: refresh }),
    remove: useMutation({
      mutationFn: (id) => api.deleteMember(id),
      onSuccess: (_data, id) => {
        qc.removeQueries({ queryKey: familyKeys.routines(id) })
        refresh()
      },
    }),
  }
}

export function useRoutineMutations(memberId) {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: familyKeys.routines(memberId) })
  return {
    create: useMutation({ mutationFn: (body) => api.createRoutine(memberId, body), onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ id, changes }) => api.updateRoutine(memberId, id, changes), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id) => api.deleteRoutine(memberId, id), onSuccess: refresh }),
  }
}

/** PATCH /me and keep the cached user in sync (name, timezone, home location). */
export function useUpdateMe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.updateMe,
    onSuccess: (user) => qc.setQueryData(queryKeys.me, user),
  })
}
