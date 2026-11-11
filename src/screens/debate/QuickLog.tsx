import { useState } from 'react'
import type { InteractionKind } from '../../domain/types'
import { KIND_LABELS, scoreInteraction } from '../../domain/scoring'
import { useCommittee } from '../../state/CommitteeContext'
import { Button } from '../../components/ui/Button'
import { DelegateSelect } from '../../components/ui/DelegateSelect'
import { Modal } from '../../components/ui/Modal'
import './debate.css'
import { TierButtons } from '../../components/ui/TierButtons'
import type { Tier } from '../../domain/types'

export function QuickLogModal({
  kind,
  onClose,
  delegateId,
  refId,
}: {
  kind: InteractionKind
  onClose: () => void
  delegateId?: string
  refId?: string
}) {
  const { state, dispatch } = useCommittee()
  const [selected, setSelected] = useState<string | null>(delegateId ?? null)
  const [note, setNote] = useState('')
  const present = state.delegates.filter((d) => d.attendance !== 'absent')
  const flat = state.scoring.flatKinds.includes(kind)

  const log = (tier: Tier) => {
    if (!selected) return
    dispatch({
      type: 'interaction/add',
      delegateId: selected,
      kind,
      tier,
      note: note.trim(),
      ...(refId !== undefined ? { refId } : {}),
      now: Date.now(),
    })
    onClose()
  }

  return (
    <Modal title={`Log: ${KIND_LABELS[kind]}`} onClose={onClose}>
      <div className="quicklog-form">
        <DelegateSelect
          label="Delegate"
          delegates={present}
          value={selected}
          onChange={setSelected}
          autoFocus={!delegateId}
        />
        <label className="field">
          <span>Note (optional)</span>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {flat ? (
          <div className="quicklog-footer">
            <Button variant="primary" disabled={!selected} onClick={() => log(1)}>
              Log
            </Button>
          </div>
        ) : (
          <>
            {kind === 'penalty' && <p className="muted">Minor / Serious / Severe</p>}
            <TierButtons
              disabled={!selected}
              points={(tier) => scoreInteraction({ kind, tier, passed: false }, state.scoring)}
              onPick={log}
            />
          </>
        )}
      </div>
    </Modal>
  )
}

const DEFAULT_KINDS: InteractionKind[] = [
  'point_of_order',
  'parliamentary_inquiry',
  'personal_privilege',
  'penalty',
]

export function QuickLogBar({ kinds = DEFAULT_KINDS }: { kinds?: InteractionKind[] }) {
  const [open, setOpen] = useState<InteractionKind | null>(null)
  return (
    <>
      <div className="row" role="group" aria-label="Quick log">
        {kinds.map((k) => (
          <Button
            key={k}
            variant={k === 'penalty' ? 'danger' : 'secondary'}
            size="sm"
            onClick={() => setOpen(k)}
          >
            {KIND_LABELS[k]}
          </Button>
        ))}
      </div>
      {open && <QuickLogModal kind={open} onClose={() => setOpen(null)} />}
    </>
  )
}
