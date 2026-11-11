import { useCallback, useEffect, useRef, useState } from 'react'
import { useCommittee } from '../../state/CommitteeContext'
import { delegateById } from '../../state/selectors'
import { scoreInteraction } from '../../domain/scoring'
import { isExpired, isRunning, remainingMs } from '../../domain/timer'
import type { InteractionKind, Tier } from '../../domain/types'
import { useNow } from '../../hooks/useNow'
import { Button } from '../../components/ui/Button'
import { TierButtons } from '../../components/ui/TierButtons'
import { TimerDisplay } from '../../components/ui/TimerDisplay'
import { TimeInput } from '../../components/ui/TimeInput'
import { DelegateChip } from '../../components/ui/DelegateChip'
import { DelegateSelect } from '../../components/ui/DelegateSelect'
import './speech.css'

const SPEECH_KIND: Record<string, InteractionKind> = {
  opening: 'opening_speech',
  gsl: 'gsl_speech',
  mod: 'mod_speech',
  resolution: 'resolution_speech',
  none: 'gsl_speech',
  unmod: 'gsl_speech',
}

function getAudioCtor() {
  try {
    const Ctor: typeof AudioContext | undefined =
      typeof window !== 'undefined'
        ? (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined
    if (!Ctor) return null
    return Ctor
  } catch {
    return null
  }
}

export function SpeechPanel() {
  const { state, dispatch } = useCommittee()
  const { debate } = state
  const { speechTimer, caucusTimer } = debate
  const now = useNow(isRunning(speechTimer) || (caucusTimer !== null && isRunning(caucusTimer)))
  const [sound, setSound] = useState(true)
  const [asker, setAsker] = useState<string | null>(null)
  const audioRef = useRef<AudioContext | null>(null)

  const speakerId = debate.currentSpeakerId
  const speaker = delegateById(state, speakerId)
  const speechKind = SPEECH_KIND[debate.mode]

  // Expiry beep
  const expired = isRunning(speechTimer) && isExpired(speechTimer, now)
  const wasExpired = useRef(expired)
  useEffect(() => {
    if (expired && !wasExpired.current && sound) {
      try {
        const Ctor = getAudioCtor()
        if (Ctor) {
          audioRef.current ??= new Ctor()
          const ctx = audioRef.current
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.frequency.value = 880
          gain.gain.value = 0.2
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start()
          osc.stop(ctx.currentTime + 0.4)
        }
      } catch {
        /* ignore */
      }
    }
    wasExpired.current = expired
  }, [expired, sound])

  const advance = useCallback(() => {
    if (speakerId === null && debate.speakersList.length === 0) return
    const t = Date.now()
    dispatch({
      type: 'batch',
      actions: [{ type: 'timer', which: 'both', op: 'pause', now: t }, { type: 'speakers/next' }],
    })
  }, [dispatch, speakerId, debate.speakersList.length])

  const toggle = useCallback(() => {
    dispatch({ type: 'timer', which: 'both', op: 'toggle', now: Date.now() })
  }, [dispatch])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target as Element | null
      if (el && typeof el.closest === 'function' && el.closest('input, textarea, select, button, [role="combobox"]')) return
      if (e.key === ' ') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'n' || e.key === 'N') {
        advance()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, advance])

  const running = isRunning(speechTimer)
  const caucusLeft =
    caucusTimer === null || debate.speakerSeconds <= 0
      ? 0
      : Math.floor(remainingMs(caucusTimer, now) / 1000 / debate.speakerSeconds)

  const speechInteraction = state.interactions.find(
    (i) => i.refId === debate.speechRef && i.delegateId === speakerId && i.kind === speechKind,
  )
  const rateSpeech = (tier: Tier) => {
    if (speakerId === null) return
    if (speechInteraction) {
      dispatch({ type: 'interaction/update', id: speechInteraction.id, patch: { tier } })
    } else {
      dispatch({
        type: 'interaction/add',
        delegateId: speakerId,
        kind: speechKind,
        tier,
        refId: debate.speechRef ?? undefined,
        now: Date.now(),
      })
    }
  }

  const advanceLabel =
    speakerId === null
      ? 'Give floor to first speaker'
      : debate.speakersList.length > 0
        ? 'Next speaker'
        : 'Finish speech'

  const present = state.delegates.filter((d) => d.attendance !== 'absent')
  const pois = state.interactions.filter((i) => i.kind === 'poi_asked' && i.refId === debate.speechRef)
  const showPoi = debate.mode !== 'opening' && speakerId !== null

  const rateLinked = (kind: 'poi_answer' | 'follow_up', poiId: string, delegateId: string, tier: Tier) => {
    const existing = state.interactions.find((i) => i.kind === kind && i.refId === poiId)
    if (existing) dispatch({ type: 'interaction/update', id: existing.id, patch: { tier } })
    else dispatch({ type: 'interaction/add', delegateId, kind, tier, refId: poiId, now: Date.now() })
  }
  const linkedTier = (kind: 'poi_answer' | 'follow_up', poiId: string): Tier | null =>
    state.interactions.find((i) => i.kind === kind && i.refId === poiId)?.tier ?? null

  return (
    <section className="speech" aria-label="Current speech">
      <div className="card speech-card speech-timers">
        <TimerDisplay timer={speechTimer} now={now} label="Speech" size="md" />
        <div className="speech-controls">
          <Button variant="primary" onClick={toggle}>
            {running ? 'Pause' : 'Start'}
          </Button>
          <Button onClick={() => dispatch({ type: 'timer', which: 'speech', op: 'reset', now: Date.now() })}>
            Reset
          </Button>
          <Button
            aria-label="Add 15 seconds"
            onClick={() => dispatch({ type: 'timer', which: 'speech', op: 'add', seconds: 15, now: Date.now() })}
          >
            +15s
          </Button>
          <Button
            aria-label="Remove 15 seconds"
            onClick={() => dispatch({ type: 'timer', which: 'speech', op: 'add', seconds: -15, now: Date.now() })}
          >
            −15s
          </Button>
        </div>
        <TimeInput
          label="Speaker time"
          seconds={debate.speakerSeconds}
          presets={[30, 45, 60, 90, 120]}
          onChange={(s) => dispatch({ type: 'timer', which: 'speech', op: 'set', seconds: s, now: Date.now() })}
        />
        <label className="speech-sound">
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
          Sound when time is up
        </label>
        {caucusTimer !== null && (
          <div className="speech-caucus">
            <TimerDisplay timer={caucusTimer} now={now} label="Caucus time" size="sm" />
            <Button onClick={() => dispatch({ type: 'timer', which: 'caucus', op: 'toggle', now: Date.now() })}>
              {isRunning(caucusTimer) ? 'Pause caucus clock' : 'Start caucus clock'}
            </Button>
            <Button
              aria-label="Add 1 minute to caucus"
              onClick={() => dispatch({ type: 'timer', which: 'caucus', op: 'add', seconds: 60, now: Date.now() })}
            >
              +1:00
            </Button>
            <span className="muted">
              ≈ {caucusLeft} speaker(s) left
            </span>
          </div>
        )}
      </div>

      <div className="card speech-card speech-floor-card">
        {speaker ? (
          <div className="speech-floor">
            <DelegateChip delegate={speaker} size={40} />
            <span className="muted">has the floor</span>
          </div>
        ) : (
          <p className="muted">No one has the floor.</p>
        )}
        {speaker && (
          <div className="speech-rate">
            <span className="speech-label">Rate this speech</span>
            <TierButtons
              selected={speechInteraction?.tier ?? null}
              points={(tier) => scoreInteraction({ kind: speechKind, tier, passed: false }, state.scoring)}
              onPick={rateSpeech}
            />
            {speechInteraction && (
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dispatch({ type: 'interaction/remove', id: speechInteraction.id })}
                >
                  Clear rating
                </Button>
              </div>
            )}
          </div>
        )}
        <Button
          variant="primary"
          size="lg"
          onClick={advance}
          disabled={speakerId === null && debate.speakersList.length === 0}
        >
          {advanceLabel}
          <kbd>N</kbd>
        </Button>
      </div>

      {showPoi && (
        <div className="card speech-card speech-pois">
          <h3>Points of information</h3>
          <div className="speech-add">
            <DelegateSelect
              label="POI from"
              placeholder="Who is asking?"
              delegates={present}
              excludeIds={speakerId ? [speakerId] : []}
              value={asker}
              onChange={setAsker}
            />
            <span className="speech-label">Rate the question</span>
            <TierButtons
              disabled={!asker}
              points={(tier) => scoreInteraction({ kind: 'poi_asked', tier, passed: false }, state.scoring)}
              onPick={(tier) => {
                if (!asker) return
                dispatch({
                  type: 'interaction/add',
                  delegateId: asker,
                  kind: 'poi_asked',
                  tier,
                  refId: debate.speechRef ?? undefined,
                  now: Date.now(),
                })
                setAsker(null)
              }}
            />
          </div>
          {pois.length === 0 ? (
            <p className="muted">No POIs logged for this speech yet.</p>
          ) : (
            <ul className="speech-poi-list">
              {pois.map((poi) => {
                const askerName = delegateById(state, poi.delegateId)
                const name = askerName?.name ?? poi.delegateId
                return (
                  <li key={poi.id} className="speech-poi" aria-label={`POI from ${name}`}>
                    {askerName ? <DelegateChip delegate={askerName} /> : <span>{name}</span>}
                    <div className="speech-poi-group" role="group" aria-label="Question quality">
                      <span className="speech-label">Question</span>
                      <TierButtons
                        compact
                        selected={poi.tier}
                        onPick={(tier) => dispatch({ type: 'interaction/update', id: poi.id, patch: { tier } })}
                      />
                    </div>
                    <div className="speech-poi-group" role="group" aria-label="Answer quality">
                      <span className="speech-label">Answer</span>
                      <TierButtons
                        compact
                        selected={linkedTier('poi_answer', poi.id)}
                        onPick={(tier) => rateLinked('poi_answer', poi.id, speakerId as string, tier)}
                      />
                    </div>
                    <div className="speech-poi-group" role="group" aria-label="Follow-up quality">
                      <span className="speech-label">Follow-up</span>
                      <TierButtons
                        compact
                        selected={linkedTier('follow_up', poi.id)}
                        onPick={(tier) => rateLinked('follow_up', poi.id, poi.delegateId, tier)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove POI from ${name}`}
                      onClick={() => {
                        const ids = state.interactions
                          .filter((i) => i.id === poi.id || ((i.kind === 'poi_answer' || i.kind === 'follow_up') && i.refId === poi.id))
                          .map((i) => i.id)
                        dispatch({
                          type: 'batch',
                          actions: ids.map((id) => ({ type: 'interaction/remove' as const, id })),
                        })
                      }}
                    >
                      Remove
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
