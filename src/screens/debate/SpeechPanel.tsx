import { useCallback, useEffect, useRef, useState } from 'react'
import { useCommittee } from '../../state/CommitteeContext'
import { delegateById } from '../../state/selectors'
import { scoreInteraction } from '../../domain/scoring'
import { formatTime, isExpired, isRunning, remainingMs } from '../../domain/timer'
import type { InteractionKind, Tier } from '../../domain/types'
import { useNow } from '../../hooks/useNow'
import { Button } from '../../components/ui/Button'
import { PipRater } from '../../components/ui/PipRater'
import { Placard } from '../../components/ui/Placard'
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
  const queued = debate.poiQueue.map((id) => delegateById(state, id)).filter((d) => d !== null && d !== undefined)
  const showPoi = debate.mode !== 'opening' && speakerId !== null

  const rateLinked = (kind: 'poi_answer' | 'follow_up', poiId: string, delegateId: string, tier: Tier) => {
    const existing = state.interactions.find((i) => i.kind === kind && i.refId === poiId)
    if (existing) dispatch({ type: 'interaction/update', id: existing.id, patch: { tier } })
    else dispatch({ type: 'interaction/add', delegateId, kind, tier, refId: poiId, now: Date.now() })
  }
  const linkedTier = (kind: 'poi_answer' | 'follow_up', poiId: string): Tier | null =>
    state.interactions.find((i) => i.kind === kind && i.refId === poiId)?.tier ?? null

  const ratePoints = (kind: InteractionKind) => (tier: Tier) =>
    scoreInteraction({ kind, tier, passed: false }, state.scoring)

  return (
    <section className="speech" aria-label="Current speech">
      <div className="speech-stage">
        <div className="speech-floor">
          {speaker ? (
            <Placard delegate={speaker} size="lg" />
          ) : (
            <div className="speech-nofloor">
              <p className="speech-nofloor-title muted">No one has the floor.</p>
              <p className="muted">Add a speaker, then give them the floor.</p>
            </div>
          )}
        </div>
        <div className="speech-clock">
          <TimerDisplay timer={speechTimer} now={now} label="Speech" size="xl" />
        </div>
      </div>

      <div className="speech-controls">
        <Button variant="primary" size="lg" onClick={toggle}>
          {running ? 'Pause' : 'Start'}
        </Button>
        <Button size="lg" onClick={advance} disabled={speakerId === null && debate.speakersList.length === 0}>
          {advanceLabel}
          <kbd>N</kbd>
        </Button>
        <details className="speech-adjust">
          <summary>Adjust</summary>
          <div className="speech-adjust-body">
            <div className="speech-adjust-row">
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
              <div className="speech-adjust-row">
                <Button onClick={() => dispatch({ type: 'timer', which: 'caucus', op: 'toggle', now: Date.now() })}>
                  {isRunning(caucusTimer) ? 'Pause caucus clock' : 'Start caucus clock'}
                </Button>
                <Button
                  aria-label="Add 1 minute to caucus"
                  onClick={() => dispatch({ type: 'timer', which: 'caucus', op: 'add', seconds: 60, now: Date.now() })}
                >
                  +1:00
                </Button>
              </div>
            )}
          </div>
        </details>
      </div>

      {caucusTimer !== null && (
        <p
          className={`speech-caucus-line${
            isExpired(caucusTimer, now) ? ' is-expired' : remainingMs(caucusTimer, now) <= 10_000 ? ' is-warning' : ''
          }`}
        >
          Caucus <span className="tabular">{formatTime(remainingMs(caucusTimer, now))}</span>
          {`, about ${caucusLeft} speaker(s) left`}
        </p>
      )}

      {speaker && (
        <div className="speech-rate">
          <span className="speech-caption">Speech</span>
          <PipRater
            label="Rate this speech"
            size="md"
            showLabel
            value={speechInteraction?.tier ?? null}
            points={ratePoints(speechKind)}
            onPick={rateSpeech}
            onClear={
              speechInteraction
                ? () => dispatch({ type: 'interaction/remove', id: speechInteraction.id })
                : undefined
            }
          />
        </div>
      )}

      {showPoi && (
        <div className="speech-pois">
          <h3>Points of information</h3>
          {pois.length === 0 && queued.length === 0 ? (
            <p className="muted">No POIs logged for this speech yet.</p>
          ) : (
            <ul className="speech-poi-list">
              {queued.map((d) => (
                <li key={`q-${d.id}`} className="speech-poi speech-poi-queued" aria-label={`Queued POI from ${d.name}`}>
                  <span className="speech-poi-asker">
                    <DelegateChip delegate={d} />
                  </span>
                  <span className="speech-poi-waiting muted">Waiting</span>
                  <span className="speech-poi-rating">
                    <PipRater
                      label={`Rate question from ${d.name}`}
                      size="sm"
                      value={null}
                      points={ratePoints('poi_asked')}
                      onPick={(tier) =>
                        dispatch({
                          type: 'batch',
                          actions: [
                            { type: 'poi/unqueue', id: d.id },
                            {
                              type: 'interaction/add',
                              delegateId: d.id,
                              kind: 'poi_asked',
                              tier,
                              refId: debate.speechRef ?? undefined,
                              now: Date.now(),
                            },
                          ],
                        })
                      }
                    />
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${d.name} from POI queue`}
                    onClick={() => dispatch({ type: 'poi/unqueue', id: d.id })}
                  >
                    ✕
                  </Button>
                </li>
              ))}
              {pois.map((poi) => {
                const askerName = delegateById(state, poi.delegateId)
                const name = askerName?.name ?? poi.delegateId
                return (
                  <li key={poi.id} className="speech-poi" aria-label={`POI from ${name}`}>
                    <span className="speech-poi-asker">
                      {askerName ? <DelegateChip delegate={askerName} /> : <span>{name}</span>}
                    </span>
                    <span className="speech-poi-rating">
                      <span className="speech-caption">Question</span>
                      <PipRater
                        label="Question quality"
                        size="sm"
                        value={poi.tier}
                        onPick={(tier) => dispatch({ type: 'interaction/update', id: poi.id, patch: { tier } })}
                      />
                    </span>
                    <span className="speech-poi-rating">
                      <span className="speech-caption">Answer</span>
                      <PipRater
                        label="Answer quality"
                        size="sm"
                        value={linkedTier('poi_answer', poi.id)}
                        onPick={(tier) => rateLinked('poi_answer', poi.id, speakerId as string, tier)}
                      />
                    </span>
                    <span className="speech-poi-rating">
                      <span className="speech-caption">Follow-up</span>
                      <PipRater
                        label="Follow-up quality"
                        size="sm"
                        value={linkedTier('follow_up', poi.id)}
                        onPick={(tier) => rateLinked('follow_up', poi.id, poi.delegateId, tier)}
                      />
                    </span>
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
                      ✕
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="speech-add">
            <div className="speech-add-select">
              <DelegateSelect
                label="POI from"
                placeholder="Add a POI: who is asking?"
                delegates={present}
                excludeIds={[...(speakerId ? [speakerId] : []), ...debate.poiQueue]}
                value={null}
                onChange={(id) => {
                  if (id) dispatch({ type: 'poi/queue', id })
                }}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
