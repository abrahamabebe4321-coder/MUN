import { useState } from 'react';
import type { Delegate, Resolution, Tier } from '../../domain/types';
import { scoreInteraction } from '../../domain/scoring';
import { isRunning } from '../../domain/timer';
import { peekId } from '../../state/reducer';
import type { Action } from '../../state/reducer';
import { useCommittee } from '../../state/CommitteeContext';
import { useNow } from '../../hooks/useNow';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Menu } from '../../components/ui/Menu';
import { PipRater } from '../../components/ui/PipRater';
import { TierButtons } from '../../components/ui/TierButtons';
import { TimerDisplay } from '../../components/ui/TimerDisplay';
import { TimeInput } from '../../components/ui/TimeInput';
import { DelegateChip } from '../../components/ui/DelegateChip';
import { DelegateSelect } from '../../components/ui/DelegateSelect';
import { VoteModal } from '../voting/VoteModal';
import { useNav } from '../nav';
import './resolutions.css';

const STATUS_LABEL = { draft: 'Draft', presented: 'Presented', passed: 'Passed', failed: 'Failed' } as const;
const AMEND_LABEL = { pending: 'Pending', passed: 'Passed', failed: 'Failed' } as const;

function present(delegates: Delegate[]): Delegate[] {
  return delegates.filter((d) => d.attendance !== 'absent');
}

export function AmendmentSpeechModal({
  resolutionId,
  amendmentId,
  onClose,
}: {
  resolutionId: string;
  amendmentId: string;
  onClose: () => void;
}) {
  const { state, dispatch } = useCommittee();
  const res = state.resolutions.find((r) => r.id === resolutionId);
  const amendment = res?.amendments.find((a) => a.id === amendmentId);
  const [speakerId, setSpeakerId] = useState<string | null>(amendment?.proposerId ?? null);
  const running = isRunning(state.debate.speechTimer);
  const now = useNow(running);

  if (!res || !amendment) return null;

  const existing = speakerId
    ? state.interactions.find(
        (i) => i.kind === 'amendment_speech' && i.refId === amendmentId && i.delegateId === speakerId,
      )
    : undefined;

  const rate = (tier: Tier) => {
    if (!speakerId) return;
    if (existing) dispatch({ type: 'interaction/update', id: existing.id, patch: { tier } });
    else
      dispatch({
        type: 'interaction/add',
        delegateId: speakerId,
        kind: 'amendment_speech',
        tier,
        refId: amendmentId,
        now: Date.now(),
      });
  };

  const close = () => {
    if (isRunning(state.debate.speechTimer)) {
      dispatch({ type: 'timer', which: 'speech', op: 'pause', now: Date.now() });
    }
    onClose();
  };

  return (
    <Modal title="Amendment speech" onClose={close} footer={<Button variant="primary" onClick={close}>Done</Button>}>
      <div className="res-modal">
        <p className="res-modal-desc">{amendment.description}</p>
        <DelegateSelect
          delegates={present(state.delegates)}
          value={speakerId}
          onChange={setSpeakerId}
          label="Speaker"
          placeholder="Speaker…"
        />
        <div className="res-modal-timer">
          <TimerDisplay timer={state.debate.speechTimer} now={now} size="md" label="Speech" />
          <div className="row">
          <Button variant="primary" onClick={() => dispatch({ type: 'timer', which: 'speech', op: 'toggle', now: Date.now() })}>
            {running ? 'Pause' : 'Start'}
          </Button>
          <Button variant="ghost" onClick={() => dispatch({ type: 'timer', which: 'speech', op: 'reset', now: Date.now() })}>
            Reset
          </Button>
          </div>
        </div>
        <TimeInput
          label="Speaker time"
          seconds={state.debate.speakerSeconds}
          presets={[30, 45, 60, 90]}
          onChange={(seconds) => dispatch({ type: 'timer', which: 'speech', op: 'set', seconds, now: Date.now() })}
        />
        <div>
          <div className="res-label" id="res-rate-label">Rate the speech</div>
          <TierButtons
            disabled={!speakerId}
            selected={existing?.tier ?? null}
            onPick={rate}
            points={(tier) => scoreInteraction({ kind: 'amendment_speech', tier, passed: false }, state.scoring)}
          />
        </div>
      </div>
    </Modal>
  );
}

function PeopleGroup({
  res,
  field,
  singular,
  title,
}: {
  res: Resolution;
  field: 'sponsorIds' | 'signatoryIds';
  singular: 'sponsor' | 'signatory';
  title: string;
}) {
  const { state, dispatch } = useCommittee();
  const ids = res[field];
  const plural = field === 'sponsorIds' ? 'sponsors' : 'signatories';
  const members = ids
    .map((id) => state.delegates.find((d) => d.id === id))
    .filter((d): d is Delegate => !!d);
  const set = (next: string[]) => dispatch({ type: 'resolution/update', id: res.id, patch: { [field]: next } });
  return (
    <div className="res-group">
      <h4>
        {title} ({ids.length})
      </h4>
      <div className="res-chips">
        {members.map((d) => (
          <span key={d.id} className="res-chip">
            <DelegateChip delegate={d} />
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove ${d.name} from ${plural}`}
              onClick={() => set(ids.filter((x) => x !== d.id))}
            >
              ✕
            </Button>
          </span>
        ))}
        <div className="res-combo">
          <DelegateSelect
            delegates={state.delegates}
            value={null}
            label={`Add ${singular} to ${res.name}`}
            placeholder={`Add ${singular}…`}
            excludeIds={[...res.sponsorIds, ...res.signatoryIds]}
            onChange={(id) => {
              if (id) set([...ids, id]);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function AmendmentForm({ res }: { res: Resolution }) {
  const { state, dispatch } = useCommittee();
  const [proposer, setProposer] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [tier, setTier] = useState<Tier>(1);
  const ok = proposer !== null && text.trim() !== '';
  const add = () => {
    if (!ok || proposer === null) return;
    const amendmentId = peekId(state, 'a');
    dispatch({
      type: 'batch',
      actions: [
        { type: 'amendment/add', resolutionId: res.id, proposerId: proposer, description: text.trim() },
        { type: 'interaction/add', delegateId: proposer, kind: 'amendment_proposed', tier, refId: amendmentId, now: Date.now() },
      ],
    });
    setProposer(null);
    setText('');
    setTier(1);
  };
  return (
    <div className="res-amend-form">
      <DelegateSelect
        delegates={present(state.delegates)}
        value={proposer}
        onChange={setProposer}
        label={`Amendment proposer for ${res.name}`}
        placeholder="Proposed by…"
      />
      <label className="res-field">
        Amendment
        <input
          type="text"
          placeholder="e.g. Strike operative clause 3"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="res-quality">
        <span className="res-caption" aria-hidden="true">Quality</span>
        <PipRater
          label="Quality of the amendment"
          size="md"
          value={tier}
          onPick={setTier}
          points={(t) => scoreInteraction({ kind: 'amendment_proposed', tier: t, passed: false }, state.scoring)}
        />
      </div>
      <Button disabled={!ok} onClick={add}>
        Add amendment
      </Button>
    </div>
  );
}

function ResolutionCard({ res }: { res: Resolution }) {
  const { state, dispatch } = useCommittee();
  const nav = useNav();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(res.name);
  const [voting, setVoting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [voteAmendment, setVoteAmendment] = useState<string | null>(null);
  const [speechAmendment, setSpeechAmendment] = useState<string | null>(null);

  const commitName = () => {
    const n = draftName.trim();
    if (n && n !== res.name) dispatch({ type: 'resolution/update', id: res.id, patch: { name: n } });
    setRenaming(false);
  };

  const presentIt = () => {
    const actions: Action[] = [
      { type: 'timer', which: 'both', op: 'pause', now: Date.now() },
      { type: 'resolution/update', id: res.id, patch: { status: 'presented' } },
      { type: 'debate/start', mode: 'resolution', topic: res.name, resolutionId: res.id },
      ...res.sponsorIds.map((id): Action => ({ type: 'speakers/add', id })),
    ];
    dispatch({ type: 'batch', actions });
    nav('debate');
  };

  const voteAm = res.amendments.find((a) => a.id === voteAmendment);

  return (
    <article className="res-card" aria-label={res.name}>
      <div className="res-head">
        {renaming ? (
          <input
            type="text"
            autoFocus
            aria-label={`Resolution name for ${res.name}`}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              else if (e.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <>
            <h3 className="res-name">{res.name}</h3>
            <span className={`res-status res-status-${res.status}`}>{STATUS_LABEL[res.status]}</span>
          </>
        )}
        <div className="res-actions">
          {res.status === 'draft' || res.status === 'presented' ? (
            <Button variant="primary" onClick={presentIt}>
              Present
            </Button>
          ) : null}
          <Button onClick={() => setVoting(true)}>Vote on resolution</Button>
          <Menu
            label={`More for ${res.name}`}
            variant="ghost"
            size="sm"
            align="right"
            items={[
              {
                label: 'Rename',
                onSelect: () => {
                  setDraftName(res.name);
                  setRenaming(true);
                },
              },
              { label: 'Delete', danger: true, onSelect: () => setConfirmDelete(true) },
            ]}
          >
            ⋯
          </Menu>
        </div>
      </div>

      <div className="res-people">
        <PeopleGroup res={res} field="sponsorIds" singular="sponsor" title="Sponsors" />
        <PeopleGroup res={res} field="signatoryIds" singular="signatory" title="Signatories" />
      </div>

      {res.status === 'draft' ? (
        <p className="muted res-help">
          Present opens the debate screen with the sponsors queued; speeches there are scored as resolution speeches.
        </p>
      ) : null}

      <div className="res-amendments">
        <h4>Amendments ({res.amendments.length})</h4>
        <ul className="res-amend-list">
          {res.amendments.map((a) => {
            const proposer = state.delegates.find((d) => d.id === a.proposerId);
            return (
              <li key={a.id} className="res-amend" aria-label={`Amendment: ${a.description}`}>
                <span className="res-amend-text">{a.description}</span>
                {proposer ? <DelegateChip delegate={proposer} /> : null}
                <span className={`res-status res-status-${a.status}`}>{AMEND_LABEL[a.status]}</span>
                <Button size="sm" variant="ghost" onClick={() => setSpeechAmendment(a.id)}>
                  Speech
                </Button>
                {a.status === 'pending' ? (
                  <Button size="sm" variant="ghost" onClick={() => setVoteAmendment(a.id)}>
                    Vote
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove amendment: ${a.description}`}
                  onClick={() => dispatch({ type: 'amendment/remove', resolutionId: res.id, id: a.id })}
                >
                  ✕
                </Button>
              </li>
            );
          })}
        </ul>
        <AmendmentForm res={res} />
      </div>

      {voting ? (
        <VoteModal
          subject={`Resolution: ${res.name}`}
          procedural={false}
          method="rollcall"
          threshold="simple"
          extraActions={(passed) => [
            { type: 'resolution/update', id: res.id, patch: { status: passed ? 'passed' : 'failed' } },
          ]}
          onClose={() => setVoting(false)}
        />
      ) : null}
      {voteAm ? (
        <VoteModal
          subject={`Amendment to ${res.name}: ${voteAm.description}`}
          procedural={false}
          method="quick"
          threshold="simple"
          extraActions={(passed) => [
            { type: 'amendment/setStatus', resolutionId: res.id, id: voteAm.id, status: passed ? 'passed' : 'failed' },
          ]}
          onClose={() => setVoteAmendment(null)}
        />
      ) : null}
      {speechAmendment ? (
        <AmendmentSpeechModal
          resolutionId={res.id}
          amendmentId={speechAmendment}
          onClose={() => setSpeechAmendment(null)}
        />
      ) : null}
      {confirmDelete ? (
        <Modal
          title="Delete resolution"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button
                variant="danger"
                className="btn-solid"
                onClick={() => {
                  dispatch({ type: 'resolution/remove', id: res.id });
                  setConfirmDelete(false);
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          <p>Delete {res.name}? Its amendments and their scores are removed.</p>
        </Modal>
      ) : null}
    </article>
  );
}

export function ResolutionsPanel() {
  const { state, dispatch } = useCommittee();
  const [name, setName] = useState('');
  const add = () => {
    const n = name.trim();
    if (!n) return;
    dispatch({ type: 'resolution/add', name: n });
    setName('');
  };
  return (
    <section className="res" aria-label="Resolutions">
      <h2>Resolutions</h2>
      <form
        className="res-add-row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label className="res-field">
          Resolution name
          <input
            type="text"
            placeholder="e.g. Draft Resolution 1.1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <Button type="submit" variant="primary" disabled={name.trim() === ''}>
          Add resolution
        </Button>
      </form>
      {state.resolutions.length === 0 ? <p className="muted">No draft resolutions yet.</p> : null}
      {state.resolutions.map((r) => (
        <ResolutionCard key={r.id} res={r} />
      ))}
    </section>
  );
}
