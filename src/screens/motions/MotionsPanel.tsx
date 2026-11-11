import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { DelegateChip } from '../../components/ui/DelegateChip';
import { DelegateSelect } from '../../components/ui/DelegateSelect';
import { Menu } from '../../components/ui/Menu';
import { PipRater } from '../../components/ui/PipRater';
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
      out.push({ type: 'speakers/add', id: m.proposerId });
      if (m.proposerSpeaks === 'last') out.push({ type: 'speakers/pinLast', id: m.proposerId });
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
  const [proposerSpeaks, setProposerSpeaks] = useState<'first' | 'last'>('first');

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
          ...(type === 'mod' ? { proposerSpeaks } : {}),
        },
        { type: 'interaction/add', delegateId: proposer, kind: 'motion_raised', tier, refId: motionId, now: Date.now() },
      ],
    });
    setProposer(null);
    setTopic('');
    setTier(1);
  };

  return (
    <form className="motions-form" onSubmit={submit}>
      <div className="motions-fields">
        <div className="field motions-type">
          <label htmlFor="motions-type">Motion type</label>
          <select id="motions-type" aria-label="Motion type" value={type} onChange={(e) => changeType(e.target.value as MotionType)}>
            {TYPE_ORDER.map((t) => (
              <option key={t} value={t}>{MOTION_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div className="field motions-proposer">
          <span className="motions-caption">Proposed by</span>
          <DelegateSelect delegates={present} value={proposer} onChange={setProposer} label="Proposed by" placeholder="Proposed by…" />
        </div>
        {needs.topic && (
          <div className="field motions-topic">
            <label htmlFor="motions-topic">{type === 'other' ? 'Description' : 'Topic'}</label>
            <input id="motions-topic" type="text" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
        )}
        {needs.totalTime && <TimeInput label="Total time" seconds={total} onChange={setTotal} />}
        {needs.speakerTime && <TimeInput label="Speaker time" seconds={speaker} onChange={setSpeaker} />}
        {type === 'mod' && (
          <div className="field motions-speaks">
            <span className="motions-caption">Proposer speaks</span>
            <div className="motions-seg" role="radiogroup" aria-label="Proposer speaks">
              {(['first', 'last'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={proposerSpeaks === v}
                  className="motions-opt"
                  onClick={() => setProposerSpeaks(v)}
                >
                  {v === 'first' ? 'First' : 'Last'}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="field motions-quality">
          <span className="motions-caption">Quality</span>
          <PipRater
            label="Motion quality"
            size="md"
            value={tier}
            onPick={setTier}
            points={(t) => scoreInteraction({ kind: 'motion_raised', tier: t, passed: false }, state.scoring)}
          />
        </div>
        <Button type="submit" variant="primary" disabled={!canSubmit}>Add to the floor</Button>
      </div>
      {type === 'mod' && speaker > 0 && <p className="muted motions-hint">{`${Math.floor(total / speaker)} speakers`}</p>}
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
    <div className="motions-block">
      <div className="motions-head">
        <h3>On the floor</h3>
        <span className="muted tabular">{pending.length}</span>
        {pending.length >= 2 && (
          <Button className="motions-head-end" variant="ghost" onClick={() => dispatch({ type: 'motion/clearPending' })}>
            Clear the floor
          </Button>
        )}
      </div>
      {pending.length === 0 ? (
        <p className="muted">No motions on the floor. Add one above.</p>
      ) : (
        <>
          <p className="muted motions-note">Voted on most disruptive first, then longest.</p>
          <ol className="list motions-list">
            {pending.map((m, i) => {
              const proposer = delegateById(state, m.proposerId);
              const position = i + 1;
              return (
                <li key={m.id} className="list-row motions-item" aria-label={describeMotion(m)}>
                  <span className="motions-pos tabular">{position}</span>
                  <span className="motions-desc">
                    {describeMotion(m)}
                    {m.type === 'mod' && m.proposerSpeaks === 'last' ? ', proposer speaks last' : ''}
                  </span>
                  <span className="motions-by">{proposer ? <DelegateChip delegate={proposer} /> : m.proposerId}</span>
                  <span className="motions-actions">
                    <Button variant={i === 0 ? 'primary' : 'ghost'} onClick={() => setVoting(m)}>Vote</Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        dispatch({ type: 'batch', actions: outcomeActions(m, true) });
                        after(m, true);
                      }}
                    >
                      Pass without vote
                    </Button>
                    <Menu
                      label={`More for motion ${position}`}
                      variant="ghost"
                      size="sm"
                      align="right"
                      items={[
                        { label: 'Fail', onSelect: () => dispatch({ type: 'motion/setStatus', id: m.id, status: 'failed' }) },
                        { label: 'Withdraw', onSelect: () => dispatch({ type: 'motion/setStatus', id: m.id, status: 'withdrawn' }) },
                      ]}
                    >
                      ⋯
                    </Menu>
                  </span>
                </li>
              );
            })}
          </ol>
        </>
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
    <details className="motions-details">
      <summary>{`Earlier motions (${done.length})`}</summary>
      {done.length === 0 ? (
        <p className="muted">No earlier motions.</p>
      ) : (
        <ul className="list motions-list">
          {shown.map((m) => {
            const proposer = delegateById(state, m.proposerId);
            return (
              <li key={m.id} className="list-row motions-item">
                <span className="motions-desc">{describeMotion(m)}</span>
                <span className="motions-by">{proposer ? <DelegateChip delegate={proposer} /> : m.proposerId}</span>
                <span className={`motions-status motions-status-${m.status}`}>{STATUS_LABEL[m.status]}</span>
                <span className="muted">{`Session ${m.session}`}</span>
                {(m.status === 'failed' || m.status === 'withdrawn') && (
                  <Button
                    variant="ghost"
                    size="sm"
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
    </details>
  );
}

function VoteRow({ v }: { v: VoteRecord }) {
  const { state, dispatch } = useCommittee();
  return (
    <li className="list-row motions-item">
      <div className="motions-vote-meta">
        <span className="motions-desc">{v.subject}</span>
        <span className="tabular">{`For ${v.for}, against ${v.against}, abstain ${v.abstain}`}</span>
        <span className="muted">
          {`${v.procedural ? 'Procedural' : 'Substantive'}, ${v.threshold === 'simple' ? 'simple majority' : 'two-thirds'}, session ${v.session}`}
        </span>
      </div>
      <span className={`motions-status ${v.passed ? 'motions-status-passed' : 'motions-status-failed'}`}>{v.passed ? 'Passed' : 'Failed'}</span>
      <Button variant="ghost" size="sm" aria-label={`Delete vote: ${v.subject}`} onClick={() => dispatch({ type: 'vote/remove', id: v.id })}>
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
    <div className="motions-vr">
      <details className="motions-details">
        <summary>{`Vote record (${votes.length})`}</summary>
        {votes.length === 0 ? (
          <p className="muted">No votes recorded yet.</p>
        ) : (
          <ul className="list motions-list">
            {votes.map((v) => (
              <VoteRow key={v.id} v={v} />
            ))}
          </ul>
        )}
      </details>
      <Button className="motions-vr-new" size="sm" onClick={() => setOpen(true)}>New vote</Button>
      {open && <VoteModal subject="" editableSubject procedural={false} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function MotionsPanel() {
  return (
    <section className="motions" aria-label="Motions and voting">
      <h2>Motions</h2>
      <RaiseForm />
      <OnTheFloor />
      <Earlier />
      <VoteRecordCard />
    </section>
  );
}
