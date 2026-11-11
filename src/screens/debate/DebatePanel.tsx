import { useState } from 'react'
import { useCommittee } from '../../state/CommitteeContext'
import type { Action } from '../../state/reducer'
import type { DebateMode } from '../../state/state'
import { isExpired, isRunning } from '../../domain/timer'
import { useNow } from '../../hooks/useNow'
import { Button } from '../../components/ui/Button'
import { Menu } from '../../components/ui/Menu'
import { Modal } from '../../components/ui/Modal'
import { TimeInput } from '../../components/ui/TimeInput'
import { TimerDisplay } from '../../components/ui/TimerDisplay'
import { DelegateSelect } from '../../components/ui/DelegateSelect'
import { SpeechPanel } from './SpeechPanel'
import { SpeakersPanel } from './SpeakersPanel'
import { QuickLogModal } from './QuickLog'
import { KIND_LABELS } from '../../domain/scoring'
import type { InteractionKind } from '../../domain/types'
import './debate.css'

type StartMode = 'opening' | 'gsl' | 'mod' | 'unmod'

const MODE_HEADINGS: Record<Exclude<DebateMode, 'mod'>, string> = {
  none: 'No debate in progress',
  opening: 'Opening speeches',
  gsl: 'General speakers list',
  unmod: 'Unmoderated caucus',
  resolution: 'Resolution debate',
}

const START_BUTTONS: { mode: StartMode; label: string }[] = [
  { mode: 'opening', label: 'Opening speeches' },
  { mode: 'gsl', label: 'General speakers list' },
  { mode: 'mod', label: 'Moderated caucus' },
  { mode: 'unmod', label: 'Unmoderated caucus' },
]

const MODAL_TITLES: Record<StartMode, string> = {
  opening: 'Start opening speeches',
  gsl: 'Open general speakers list',
  mod: 'Start moderated caucus',
  unmod: 'Start unmoderated caucus',
}

const UNMOD_KINDS = [
  'unmod_leadership',
  'point_of_order',
  'parliamentary_inquiry',
  'personal_privilege',
  'penalty',
] as const

const DEFAULT_KINDS = UNMOD_KINDS.slice(1) as readonly InteractionKind[]

export function DebatePanel() {
  const { state, dispatch } = useCommittee()
  const { debate } = state
  const [starting, setStarting] = useState<StartMode | null>(null)
  const [log, setLog] = useState<{ kind: InteractionKind; delegateId?: string } | null>(null)
  const caucus = debate.caucusTimer
  const now = useNow(caucus !== null && isRunning(caucus))
  const caucusMode = debate.mode === 'mod' || debate.mode === 'unmod'
  const elapsed = caucusMode && caucus !== null && isExpired(caucus, now)

  const heading =
    debate.mode === 'mod' ? `Moderated caucus: ${debate.topic || 'untitled'}` : MODE_HEADINGS[debate.mode]

  const endDebate = () =>
    dispatch({
      type: 'batch',
      actions: [{ type: 'timer', which: 'both', op: 'pause', now: Date.now() }, { type: 'debate/end' }],
    } as Action)

  const caucusOp = (op: 'toggle' | 'reset' | 'add', seconds?: number) =>
    dispatch({
      type: 'timer',
      which: 'caucus',
      op,
      ...(seconds !== undefined ? { seconds } : {}),
      now: Date.now(),
    })

  const present = state.delegates.filter((d) => d.attendance !== 'absent')

  const logKinds: InteractionKind[] = debate.mode === 'unmod' ? [...UNMOD_KINDS] : [...DEFAULT_KINDS]

  return (
    <section className="debate" aria-label="Debate">
      <header className="debate-head">
        <div className="debate-head-row">
          <h2>{heading}</h2>
          <div className="debate-head-actions">
            <Menu
              label={debate.mode === 'none' ? 'Start debate' : 'Change debate'}
              variant={debate.mode === 'none' ? 'primary' : 'secondary'}
              align="right"
              items={START_BUTTONS.map((b) => ({ label: b.label, onSelect: () => setStarting(b.mode) }))}
            />
            <Menu
              label="Log a point"
              variant="secondary"
              align="right"
              items={logKinds.map((k) => ({ label: KIND_LABELS[k], onSelect: () => setLog({ kind: k }) }))}
            />
            {debate.mode !== 'none' && (
              <Button variant="danger" aria-label="End current debate" onClick={endDebate}>
                End
              </Button>
            )}
          </div>
        </div>
        {elapsed && (
          <p className="debate-banner" role="status">
            Caucus time has elapsed.
          </p>
        )}
      </header>

      {debate.mode === 'unmod' && caucus ? (
        <div className="debate-unmod">
          <div className="debate-unmod-timer">
            <TimerDisplay timer={caucus} now={now} label="Unmoderated caucus" size="xl" />
            <div className="debate-unmod-controls">
              <Button variant="primary" size="lg" onClick={() => caucusOp('toggle')}>
                {isRunning(caucus) ? 'Pause' : 'Start'}
              </Button>
              <details className="speech-adjust">
                <summary>Adjust</summary>
                <div className="speech-adjust-body">
                  <Button onClick={() => caucusOp('reset')}>Reset</Button>
                  <Button aria-label="Add 1 minute" onClick={() => caucusOp('add', 60)}>
                    +1:00
                  </Button>
                  <Button aria-label="Remove 1 minute" onClick={() => caucusOp('add', -60)}>
                    −1:00
                  </Button>
                </div>
              </details>
            </div>
          </div>
          <div className="debate-leadership">
            <span className="muted">Credit leadership you observe</span>
            <div className="debate-leadership-select">
              <DelegateSelect
                label="Log leadership for"
                placeholder="Choose a delegate…"
                delegates={present}
                value={null}
                onChange={(id) => id && setLog({ kind: 'unmod_leadership', delegateId: id })}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="debate-grid">
          <SpeechPanel />
          <SpeakersPanel />
        </div>
      )}

      {log && (
        <QuickLogModal kind={log.kind} delegateId={log.delegateId} onClose={() => setLog(null)} />
      )}
      {starting && <StartDebateModal mode={starting} onClose={() => setStarting(null)} />}
    </section>
  )
}

export function StartDebateModal({
  mode,
  onClose,
  initial,
}: {
  mode: StartMode
  onClose: () => void
  initial?: { topic?: string; totalSeconds?: number; speakerSeconds?: number }
}) {
  const { state, dispatch } = useCommittee()
  const [topic, setTopic] = useState(initial?.topic ?? '')
  const [total, setTotal] = useState(initial?.totalSeconds ?? (mode === 'unmod' ? 900 : 600))
  const [speaker, setSpeaker] = useState(
    initial?.speakerSeconds ?? (mode === 'opening' ? 60 : state.debate.speakerSeconds),
  )
  const [queueAll, setQueueAll] = useState(true)

  const blocked = mode === 'mod' && topic.trim() === ''

  const start = () => {
    if (blocked) return
    const actions: Action[] = [
      { type: 'timer', which: 'both', op: 'pause', now: Date.now() },
      {
        type: 'debate/start',
        mode,
        ...(mode === 'mod' ? { topic: topic.trim() } : {}),
        ...(mode === 'mod' || mode === 'unmod' ? { totalSeconds: total } : {}),
        ...(mode !== 'unmod' ? { speakerSeconds: speaker } : {}),
      },
    ]
    if (mode === 'opening' && queueAll) {
      for (const d of state.delegates) {
        if (d.attendance !== 'absent') actions.push({ type: 'speakers/add', id: d.id })
      }
    }
    dispatch({ type: 'batch', actions } as Action)
    onClose()
  }

  return (
    <Modal
      title={MODAL_TITLES[mode]}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={blocked} onClick={start}>
            Start
          </Button>
        </>
      }
    >
      <div className="debate-form">
        {state.debate.mode !== 'none' && (
          <p className="debate-warning" role="alert">
            This ends the current debate and clears its speakers list.
          </p>
        )}
        {mode === 'mod' && (
          <label className="field">
            <span>Topic</span>
            <input type="text" value={topic} autoFocus onChange={(e) => setTopic(e.target.value)} />
          </label>
        )}
        {(mode === 'mod' || mode === 'unmod') && (
          <TimeInput label="Total time" seconds={total} onChange={setTotal} presets={[300, 600, 900, 1200]} />
        )}
        {mode === 'mod' && (
          <TimeInput label="Speaker time" seconds={speaker} onChange={setSpeaker} presets={[30, 45, 60, 90]} />
        )}
        {mode === 'mod' && speaker > 0 && <p className="muted">{`${Math.floor(total / speaker)} speakers`}</p>}
        {mode === 'gsl' && (
          <TimeInput label="Speaker time" seconds={speaker} onChange={setSpeaker} presets={[45, 60, 90, 120]} />
        )}
        {mode === 'opening' && (
          <>
            <TimeInput label="Speaker time" seconds={speaker} onChange={setSpeaker} presets={[45, 60, 90]} />
            <label className="row">
              <input type="checkbox" checked={queueAll} onChange={(e) => setQueueAll(e.target.checked)} />
              <span>Queue every present delegate in alphabetical order</span>
            </label>
          </>
        )}
      </div>
    </Modal>
  )
}
