import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useMemberMutations } from '../../hooks/useFamily'
import { useToast } from '../../hooks/useToast'
import { Button } from '../ui/Button'
import { Drawer } from '../ui/Drawer'
import { ConfirmDialog } from '../ui/Modal'
import { MemberForm } from './MemberForm'
import { RoutineEditor } from './RoutineEditor'

/**
 * Side panel (bottom sheet on mobile) to add or edit a member and their routines.
 * `member` null = add mode. After adding, the panel switches to edit mode for the new
 * member so routines can be added straight away.
 */
export function MemberDrawer({ open, member, onClose }) {
  const { toast } = useToast()
  const m = useMemberMutations()
  const [created, setCreated] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const current = member || created

  function close() {
    setCreated(null)
    setConfirmDelete(false)
    onClose()
  }

  async function save(body) {
    if (current) {
      await m.update.mutateAsync({ id: current.id, changes: body })
      toast({ tone: 'success', title: 'Member saved' })
    } else {
      const newMember = await m.create.mutateAsync(body)
      setCreated(newMember)
      toast({ tone: 'success', title: `${newMember.name} added`, description: 'You can add their routines now.' })
    }
  }

  async function remove() {
    try {
      await m.remove.mutateAsync(current.id)
      toast({ tone: 'success', title: `${current.name} removed` })
      close()
    } catch (error) {
      toast({ tone: 'error', title: "Couldn't remove the member", description: error.message })
      setConfirmDelete(false)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={close}
      title={current ? `Edit ${current.name}` : 'Add family member'}
      description={current ? 'Update their details and daily routines.' : 'Age and health conditions shape their personal risk.'}
    >
      <div className="flex flex-col gap-8">
        <MemberForm
          key={current?.id || 'new'}
          member={current}
          onSubmit={save}
          submitLabel={current ? 'Save changes' : 'Add member'}
        />

        {current && (
          <>
            <div className="border-t border-line pt-6">
              <RoutineEditor memberId={current.id} memberName={current.name} />
            </div>
            <div className="border-t border-line pt-6">
              <Button variant="secondary" icon={Trash2} onClick={() => setConfirmDelete(true)} className="text-danger">
                Remove {current.name}
              </Button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={m.remove.isPending}
        danger
        title={current ? `Remove ${current.name}?` : 'Remove member?'}
        description="This permanently deletes this family member and all of their routines."
        confirmLabel="Remove member"
      />
    </Drawer>
  )
}
