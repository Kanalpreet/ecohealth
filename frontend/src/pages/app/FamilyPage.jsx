import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Plus, Users } from 'lucide-react'
import { MemberCard } from '../../components/family/MemberCard'
import { MemberDrawer } from '../../components/family/MemberDrawer'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useAllRoutines, useMembers } from '../../hooks/useFamily'
import { usePrefersReducedMotion } from '../../hooks/useMotionSafe'
import { LIMITS } from '../../lib/family'

/** /family: member cards with routines; add/edit in a side panel (bottom sheet on mobile). */
export function FamilyPage() {
  useDocumentTitle('Family')
  const reduce = usePrefersReducedMotion()
  const members = useMembers()
  const list = members.data || []
  const routines = useAllRoutines(list)
  const [panel, setPanel] = useState({ open: false, member: null })
  const atLimit = list.length >= LIMITS.MEMBERS

  const openAdd = () => setPanel({ open: true, member: null })
  const cardMotion = reduce
    ? {}
    : {
        layout: true,
        initial: { opacity: 0, scale: 0.97 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.97 },
        transition: { type: 'spring', stiffness: 380, damping: 32 },
      }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-h1 font-extrabold text-brand-hover">Your family</h1>
          <p className="mt-1 text-muted">Manage your family members and their daily routines.</p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Button icon={Plus} onClick={openAdd} disabled={atLimit || members.isLoading} className="rounded-pill">
            Add member
          </Button>
          <span className="text-xs text-muted">
            {list.length} of {LIMITS.MEMBERS} members
          </span>
        </div>
      </div>
      {atLimit && <p className="text-sm text-muted">You have reached the maximum of {LIMITS.MEMBERS} family members.</p>}

      {members.isLoading && (
        <div className="grid gap-5 md:grid-cols-2">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      )}
      {members.isError && <ErrorState title="Your family didn't load" error={members.error} onRetry={() => members.refetch()} />}
      {members.isSuccess && list.length === 0 && (
        <EmptyState
          icon={Users}
          title="No family members yet"
          description="Add the people you care about. Their age and health conditions shape their personal climate-health risk."
          action={
            <Button icon={Plus} onClick={openAdd}>
              Add your first member
            </Button>
          }
        />
      )}

      {list.length > 0 && (
        <ul className="grid gap-5 md:grid-cols-2">
          <AnimatePresence initial={false} mode="popLayout">
            {list.map((member) => (
              <motion.li key={member.id} {...cardMotion}>
                <MemberCard member={member} routinesQuery={routines[member.id]} onEdit={() => setPanel({ open: true, member })} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <MemberDrawer
        open={panel.open}
        member={panel.member ? list.find((m) => m.id === panel.member.id) || panel.member : null}
        onClose={() => setPanel({ open: false, member: null })}
      />
    </div>
  )
}
