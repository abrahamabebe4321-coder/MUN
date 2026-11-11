import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { DelegateChip } from '../../components/ui/DelegateChip';
import { DelegateSelect } from '../../components/ui/DelegateSelect';
import { TierButtons } from '../../components/ui/TierButtons';
import { TimeInput } from '../../components/ui/TimeInput';
import { describeMotion, MOTION_LABELS, motionNeeds, orderMotions } from '../../domain/motions';
import { scoreInteraction } from '../../domain/scoring';
import type { Motion, MotionType, Tier, VoteRecord } from '../../domain/types';
import { useCommittee } from '../../state/CommitteeContext';
import { peekId } from '../../state/reducer';
import type { Action } from '../../state/reducer';
import { delegateById } from '../../state/selectors';
import { useNav } from '../nav';
import { VoteModal } from '../voting/VoteModal';
import './motions.css';

const TYPE_ORDER: MotionType[] = [
  'mod', 'unmod', 'gsl', 'extend', 'present_resolutions', 'set_agenda', 'commence_debate', 'roll_call', 'adjourn', 'other',
];

const MAX_EARLIER = 20;

export function startsDebate(type: MotionType): boolean {
  return type === 'mod' || type === 'unmod' || type === 'gsl';
}

export function outcomeActions(m: Motion, passed: boolean, now: number = Date.now()): Action[] {
  if (!passed) return [{ type: 'motion/setStatus', id: m.id, status: 'failed' }];
  const out: Action[] = [{ type: 'motion/setStatus', id: m.id, status: 'passed' }];
  const pause: Action = { type: 'timer', which: 'both', op: 'pause', now };
  switch (m.type) {
    case 'mod':
      out.push(pause, {
        type: 'debate/start',
        mode: 'mod',
        topic: m.topic,
        totalSeconds: m.totalSeconds,
        speakerSeconds: m.speakerSeconds,
      });
      break;
    case 'unmod':
      out.push(pause, { type: 'debate/start', mode: 'unmod', totalSeconds: m.totalSeconds });
      break;
    case 'gsl':
      out.push(pause, { type: 'debate/start', mode: 'gsl', speakerSeconds: m.speakerSeconds });
      break;
    case 'extend':
      out.push({ type: 'timer', which: 'caucus', op: 'add', seconds: m.totalSeconds, now });
      break;
    case 'set_agenda':
      out.push({ type: 'committee/update', topic: m.topic });
      break;
    default:
      break;
  }
  out.push({ type: 'motion/clearPending' });
  return out;
}

function defaults(type: MotionType) {
  return { total: type === 'extend' ? 300 : 600, speaker: 60 };
}

function RaiseForm() {
  const { state, dispatch } = useCommittee();
  const [type, setType] = useState<MotionType>('mod');
  const [proposer, setProposer] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [total, setTotal] = useState(600);
  const [speaker, setSpeaker] = useState(60);
  const [tier, setTier] = useState<Tier>(1);

  const needs = motionNeeds(type);
  const present = state.delegates.filter((d) => d.attendance !== 'absent');
  const canSubmit = proposer !== null && (!needs.topic || topic.trim() !== '');

  const changeType = (t: MotionType) => {
    setType(t);
    const d = defaults(t);
    setTotal(d.total);
    setSpeaker(d.speaker);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || proposer === null) return;
    const motionId = peekId(state, 'm');
    dispatch({
      type: 'batch',
      actions: [
        {
          type: 'motion/add',
          motionType: type,
          proposerId: proposer,
          ...(needs.topic ? { topic: topic.trim() } : {}),
          ...(needs.totalTime ? { totalSeconds: total } : {}),
          ...(needs.speakerTime ? { speakerSeconds: speaker } : {}),
        },
        { type: 'interaction/add', delegateId: proposer, kind: 'motion_raised', tier, refId: motionId, now: Date.now() },
      ],
    });
    setProposer(null);
    setTopic('');
    setTier(1);
  };

  return (
    <form className="card motions-form" onSubmit={submit}>
      <div className="motions-card-head"><h2>Raise a motion</h2></div>
      <div className="motions-fields">
        <div className="motions-field">
          <label htmlFor="motions-type">Motion type</label>
          <select id="motions-type" aria-label="Motion type" value={type} onChange={(e) => changeType(e.target.value as MotionType)}>
            {TYPE_ORDER.map((t) => (
              <option key={t} value={t}>{MOTION_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div className="motions-field">
          <span className="motions-label">Proposed by</span>
          <DelegateSelect delegates={present} value={proposer} onChange={setProposer} label="Proposed by" placeholder="Proposed by…" />
        </div>
        {needs.topic && (
          <div className="motions-field">
            <label htmlFor="motions-topic">{type === 'other' ? 'Description' : 'Topic'}</label>
            <input id="motions-topic" type="text" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
        )}
        {needs.totalTime && (
          <TimeInput
            label="Total time"
            seconds={total}
            onChange={setTotal}
            presets={type === 'extend' ? [120, 300, 600] : [300, 600, 900, 1200]}
          />
        )}
        {needs.speakerTime && <TimeInput label="Speaker time" seconds={speaker} onChange={setSpeaker} presets={[30, 45, 60, 90]} />}
        {type === 'mod' && speaker > 0 && <span className="muted">{`${Math.floor(total / speaker)} speakers`}</span>}
      </div>
      <div className="motions-field" role="group" aria-label="Motion quality">
        <span className="motions-label">Motion quality</span>
        <div className="motions-quality">
          <TierButtons
            selected={tier}
            onPick={setTier}
            points={(t) => scoreInteraction({ kind: 'motion_raised', tier: t, passed: false }, state.scoring)}
          />
        </div>
      </div>
      <div>
        <Button type="submit" variant="primary" disabled={!canSubmit}>Add to the floor</Button>
      </div>
    </form>
  );
}

function OnTheFloor() {
  const { state, dispatch } = useCommittee();
  const nav = useNav();
  const [voting, setVoting] = useState<Motion | null>(null);
  const pending = orderMotions(state.motions);

  const after = (m: Motion, passed: boolean) => {
    if (passed && startsDebate(m.type)) nav('debate');
  };

  return (
    <div className="card">
      <div className="motions-card-head">
        <h2>On the floor</h2>
        <span className="badge">{pending.length}</span>
      </div>
      {pending.length === 0 ? (
        <p className="muted">No motions on the floor.</p>
      ) : (
        <>
          <p className="muted">Voted on in this order: most disruptive first, then longest.</p>
          <ol className="motions-list">
            {pending.map((m, i) => {
              const proposer = delegateById(state, m.proposerId);
              return (
                <li key={m.id} className="motions-item" aria-label={describeMotion(m)}>
                  <span className="motions-pos">{i + 1}</span>
                  <span className="motions-desc">{describeMotion(m)}</span>
                  <span className="motions-by">
                    by {proposer ? <DelegateChip delegate={proposer} /> : m.proposerId}
                  </span>
                  <span className="motions-actions">
                    <Button variant={i === 0 ? 'primary' : 'secondary'} onClick={() => setVoting(m)}>Vote</Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        dispatch({ type: 'batch', actions: outcomeActions(m, true) });
                        after(m, true);
                      }}
                    >
                      Pass without vote
                    </Button>
                    <Button variant="ghost" onClick={() => dispatch({ type: 'motion/setStatus', id: m.id, status: 'failed' })}>Fail</Button>
                    <Button variant="ghost" onClick={() => dispatch({ type: 'motion/setStatus', id: m.id, status: 'withdrawn' })}>Withdraw</Button>
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}
      {pending.length >= 2 && (
        <div className="motions-foot">
          <Button variant="ghost" onClick={() => dispatch({ type: 'motion/clearPending' })}>Clear the floor</Button>
        </div>
      )}
      {voting && (
        <VoteModal
          subject={describeMotion(voting)}
          procedural
          threshold="simple"
          method="quick"
          extraActions={(passed) => outcomeActions(voting, passed)}
          onRecorded={(passed) => after(voting, passed)}
          onClose={() => setVoting(null)}
        />
      )}
    </div>
  );
}

const STATUS_LABEL = { passed: 'Passed', failed: 'Failed', withdrawn: 'Withdrawn', pending: 'Pending' } as const;

function Earlier() {
  const { state, dispatch } = useCommittee();
  const done = state.motions.filter((m) => m.status !== 'pending').sort((a, b) => b.raisedOrder - a.raisedOrder);
  const shown = done.slice(0, MAX_EARLIER);
  const more = done.length - shown.length;
  return (
    <div className="card">
      <div className="motions-card-head"><h2>Earlier motions</h2></div>
      {done.length === 0 ? (
        <p className="muted">No earlier motions.</p>
      ) : (
        <ul className="motions-list">
          {shown.map((m) => {
            const proposer = delegateById(state, m.proposerId);
            return (
              <li key={m.id} className="motions-item">
                <span className="motions-desc">{describeMotion(m)}</span>
                <span className="motions-by">{proposer ? <DelegateChip delegate={proposer} /> : m.proposerId}</span>
                <span className={`badge motions-status-${m.status}`}>{STATUS_LABEL[m.status]}</span>
                <span className="muted">{`Session ${m.session}`}</span>
                {(m.status === 'failed' || m.status === 'withdrawn') && (
                  <Button
                    variant="ghost"
                    aria-label={`Bring back: ${describeMotion(m)}`}
                    onClick={() => dispatch({ type: 'motion/setStatus', id: m.id, status: 'pending' })}
                  >
                    Bring back
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {more > 0 && <p className="muted">{`+${more} older`}</p>}
    </div>
  );
}

function VoteRow({ v }: { v: VoteRecord }) {
  const { state, dispatch } = useCommittee();
  return (
    <li className="motions-item">
      <div className="motions-vote-meta">
        <span className="motions-desc">{v.subject}</span>
        <span className="tabular">{`For ${v.for} · Against ${v.against} · Abstain ${v.abstain}`}</span>
        <span className="muted">
          {`${v.procedural ? 'Procedural' : 'Substantive'} · ${v.threshold === 'simple' ? 'Simple majority' : 'Two-thirds'} · Session ${v.session}`}
        </span>
      </div>
      <span className={`badge ${v.passed ? 'motions-status-passed' : 'motions-status-failed'}`}>{v.passed ? 'Passed' : 'Failed'}</span>
      <Button variant="ghost" aria-label={`Delete vote: ${v.subject}`} onClick={() => dispatch({ type: 'vote/remove', id: v.id })}>
        Delete
      </Button>
      {v.ballots !== null && (
        <details className="motions-ballots">
          <summary>Roll call</summary>
          <ul>
            {Object.entries(v.ballots).map(([id, choice]) => (
              <li key={id}>{`${delegateById(state, id)?.name ?? id}: ${choice}`}</li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function VoteRecordCard() {
  const { state } = useCommittee();
  const [open, setOpen] = useState(false);
  const votes = [...state.votes].reverse();
  return (
    <div className="card">
      <div className="motions-card-head">
        <h2>Vote record</h2>
        <Button onClick={() => setOpen(true)}>New vote…</Button>
      </div>
      {votes.length === 0 ? (
        <p className="muted">No votes recorded yet.</p>
      ) : (
        <ul className="motions-list">
          {votes.map((v) => (
            <VoteRow key={v.id} v={v} />
          ))}
        </ul>
      )}
      {open && <VoteModal subject="" editableSubject procedural={false} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function MotionsPanel() {
  return (
    <section className="motions" aria-label="Motions and voting">
      <RaiseForm />
      <OnTheFloor />
      <Earlier />
      <VoteRecordCard />
    </section>
  );
}
