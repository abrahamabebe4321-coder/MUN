import { useCommittee } from '../../state/CommitteeContext'
import { Button } from '../../components/ui/Button'
import { DelegateChip } from '../../components/ui/DelegateChip'
import { DelegateSelect } from '../../components/ui/DelegateSelect'
import './speakers.css'

export function SpeakersPanel() {
  const { state, dispatch } = useCommittee()
  const { debate } = state
  const present = state.delegates.filter((d) => d.attendance !== 'absent')
  const byId = new Map(state.delegates.map((d) => [d.id, d]))

  const queue = debate.speakersList.map((id) => byId.get(id)).filter((d) => d !== undefined)
  const excluded = [...debate.speakersList, ...(debate.currentSpeakerId ? [debate.currentSpeakerId] : [])]
  const spokenSet = new Set(debate.spoken)
  const yetToSpeak = present.filter((d) => !spokenSet.has(d.id) && !excluded.includes(d.id))
  const spoken = [...new Set(debate.spoken)].map((id) => byId.get(id)).filter((d) => d !== undefined)

  const add = (id: string) => dispatch({ type: 'speakers/add', id })

  return (
    <section className="speakers panel" aria-label="Speakers list">
      <h3 className="speakers-heading">
        Speakers <span className="badge">{queue.length}</span>
      </h3>
      <DelegateSelect
        label="Add speaker"
        placeholder="Add a speaker…"
        value={null}
        delegates={present}
        excludeIds={excluded}
        onChange={(id) => id && add(id)}
      />
      {queue.length === 0 ? (
        <p className="muted">Add a speaker to start the list.</p>
      ) : (
        <ol className="speakers-queue">
          {queue.map((d, i) => (
            <li key={d.id} className="speakers-item" aria-label={d.name}>
              <span className="speakers-pos">{i + 1}</span>
              <span className="speakers-name">
                <DelegateChip delegate={d} />
                {debate.pinnedLastId === d.id && <span className="speakers-pinned muted">speaks last</span>}
              </span>
              <span className="speakers-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Give floor to ${d.name}`}
                  onClick={() =>
                    dispatch({
                      type: 'batch',
                      actions: [
                        { type: 'timer', which: 'both', op: 'pause', now: Date.now() },
                        { type: 'speakers/setCurrent', id: d.id },
                      ],
                    })
                  }
                >
                  Give floor
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="speakers-icon"
                  aria-label={`Move ${d.name} up`}
                  disabled={i === 0}
                  onClick={() => dispatch({ type: 'speakers/move', id: d.id, direction: -1 })}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="speakers-icon"
                  aria-label={`Move ${d.name} down`}
                  disabled={i === queue.length - 1}
                  onClick={() => dispatch({ type: 'speakers/move', id: d.id, direction: 1 })}
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="speakers-icon"
                  aria-label={`Remove ${d.name} from speakers list`}
                  onClick={() => dispatch({ type: 'speakers/remove', id: d.id })}
                >
                  ✕
                </Button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {yetToSpeak.length > 0 && (
        <details className="speakers-yetwrap">
          <summary>{`Yet to speak (${yetToSpeak.length})`}</summary>
          <div className="speakers-yet">
            {yetToSpeak.map((d) => (
              <button
                key={d.id}
                type="button"
                className="speakers-chip"
                aria-label={`Add ${d.name} to speakers list`}
                onClick={() => add(d.id)}
              >
                <DelegateChip delegate={d} />
              </button>
            ))}
          </div>
        </details>
      )}
      {spoken.length > 0 && (
        <details className="speakers-spoken">
          <summary>{`Already spoken (${spoken.length})`}</summary>
          <div className="speakers-spoken-list">
            {spoken.map((d) => (
              <DelegateChip key={d.id} delegate={d} muted />
            ))}
          </div>
        </details>
      )}
    </section>
  )
}
