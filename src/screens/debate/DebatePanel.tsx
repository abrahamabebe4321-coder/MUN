import { useState } from 'react'
import { useCommittee } from '../../state/CommitteeContext'
import type { Action } from '../../state/reducer'
import type { DebateMode } from '../../state/state'
import { isExpired, isRunning } from '../../domain/timer'
import { useNow } from '../../hooks/useNow'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { TimeInput } from '../../components/ui/TimeInput'
import { TimerDisplay } from '../../components/ui/TimerDisplay'
import { DelegateChip } from '../../components/ui/DelegateChip'
import { SpeechPanel } from './SpeechPanel'
import { SpeakersPanel } from './SpeakersPanel'
import { QuickLogBar, QuickLogModal } from './QuickLog'
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

export function DebatePanel() {
  const { state, dispatch } = useCommittee()
  const { debate } = state
  const [starting, setStarting] = useState<StartMode | null>(null)
  const [logFor, setLogFor] = useState<string | null>(null)
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

  return (
    <section className="debate" aria-label="Debate">
      <div className="card debate-status">
        <div className="debate-status-head">
          <h2>{heading}</h2>
          {debate.mode !== 'none' && (
            <Button variant="danger" aria-label="End current debate" onClick={endDebate}>
              End
            </Button>
          )}
        </div>
        {elapsed && (
          <div className="debate-banner" role="status">
            Caucus time has elapsed.
          </div>
        )}
        <div className="debate-start">
          <span className="debate-start-label">Start:</span>
          {START_BUTTONS.map((b) => (
            <Button
              key={b.mode}
              variant={debate.mode === b.mode ? 'primary' : 'secondary'}
              onClick={() => setStarting(b.mode)}
            >
              {b.label}
            </Button>
          ))}
        </div>
        <QuickLogBar kinds={debate.mode === 'unmod' ? [...UNMOD_KINDS] : undefined} />
      </div>

      {debate.mode === 'unmod' && caucus ? (
        <div className="debate-unmod">
          <div className="card">
            <TimerDisplay timer={caucus} now={now} label="Unmoderated caucus" size="md" />
            <div className="debate-unmod-controls">
              <Button variant="primary" onClick={() => caucusOp('toggle')}>
                {isRunning(caucus) ? 'Pause' : 'Start'}
              </Button>
              <Button onClick={() => caucusOp('reset')}>Reset</Button>
              <Button aria-label="Add 1 minute" onClick={() => caucusOp('add', 60)}>
                +1:00
              </Button>
              <Button aria-label="Remove 1 minute" onClick={() => caucusOp('add', -60)}>
                −1:00
              </Button>
            </div>
          </div>
          <div className="card">
            <h3>Log leadership</h3>
            <p className="muted">
              Click a delegate to credit bloc-building or drafting leadership you observe.
            </p>
            <div className="debate-leaders">
              {present.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="debate-leader"
                  aria-label={`Log leadership for ${d.name}`}
                  onClick={() => setLogFor(d.id)}
                >
                  <DelegateChip delegate={d} />
                </button>
              ))}
            </div>
          </div>
          {logFor && (
            <QuickLogModal kind="unmod_leadership" delegateId={logFor} onClose={() => setLogFor(null)} />
          )}
        </div>
      ) : (
        <div className="debate-grid">
          <SpeechPanel />
          <SpeakersPanel />
        </div>
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
          <label className="col">
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
