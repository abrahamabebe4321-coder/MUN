import { useState } from 'react';
import type { Action } from '../../state/reducer';
import type { Threshold, VoteChoice } from '../../domain/types';
import { canAbstain, countBallots, eligibleVoters, tally, validateCounts } from '../../domain/voting';
import type { Counts } from '../../domain/voting';
import { useCommittee } from '../../state/CommitteeContext';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { DelegateChip } from '../../components/ui/DelegateChip';
import './voting.css';

export interface VoteModalProps {
  subject: string;
  /** Let the chair edit the subject text (for ad-hoc votes). */
  editableSubject?: boolean;
  /** Initial vote type; default true (procedural). */
  procedural?: boolean;
  /** Initial threshold; default 'simple'. */
  threshold?: Threshold;
  /** Initial method; default 'quick' when procedural, 'rollcall' otherwise. */
  method?: 'quick' | 'rollcall';
  /** Extra actions to apply in the same undo step as the vote record, given the outcome. */
  extraActions?: (passed: boolean) => Action[];
  /** Called after the vote has been recorded. */
  onRecorded?: (passed: boolean) => void;
  onClose: () => void;
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="vote-option-group">
      <span className="vote-option-label">{label}</span>
      <div className="vote-seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className="vote-opt"
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Counter({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="vote-counter">
      <span className="vote-option-label">{label}</span>
      <div className="vote-counter-controls">
        <Button variant="ghost" size="sm" aria-label={`Decrease ${label}`} disabled={disabled} onClick={() => onChange(Math.max(0, value - 1))}>
          −
        </Button>
        <input
          type="number"
          min={0}
          aria-label={label}
          className="tabular"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            onChange(Number.isNaN(n) ? 0 : n);
          }}
        />
        <Button variant="ghost" size="sm" aria-label={`Increase ${label}`} disabled={disabled} onClick={() => onChange(value + 1)}>
          +
        </Button>
      </div>
    </div>
  );
}

const CHOICES: { value: VoteChoice; label: string }[] = [
  { value: 'for', label: 'For' },
  { value: 'against', label: 'Against' },
  { value: 'abstain', label: 'Abstain' },
];

export function VoteModal({
  subject,
  editableSubject,
  procedural: proceduralInit = true,
  threshold: thresholdInit = 'simple',
  method: methodInit,
  extraActions,
  onRecorded,
  onClose,
}: VoteModalProps) {
  const { state, dispatch } = useCommittee();
  const [subjectText, setSubjectText] = useState(subject);
  const [procedural, setProcedural] = useState(proceduralInit);
  const [threshold, setThreshold] = useState<Threshold>(thresholdInit);
  const [method, setMethod] = useState<'quick' | 'rollcall'>(methodInit ?? (proceduralInit ? 'quick' : 'rollcall'));
  const [quick, setQuick] = useState<Counts>({ for: 0, against: 0, abstain: 0 });
  const [ballots, setBallots] = useState<Record<string, VoteChoice>>({});

  const voters = eligibleVoters(state.delegates);
  const n = voters.length;

  const setType = (isProcedural: boolean) => {
    setProcedural(isProcedural);
    if (isProcedural) {
      setQuick((q) => ({ ...q, abstain: 0 }));
      setBallots((b) => {
        const next: Record<string, VoteChoice> = {};
        for (const [id, c] of Object.entries(b)) if (c !== 'abstain') next[id] = c;
        return next;
      });
    }
  };

  const counts: Counts = method === 'quick' ? quick : countBallots(ballots);
  const result = tally(counts, threshold);
  const error = method === 'quick' ? validateCounts(quick, n, procedural) : null;
  const voted = Object.keys(ballots).length;
  const blankSubject = !!editableSubject && subjectText.trim() === '';
  const canRecord = result.cast > 0 && !error && !blankSubject;

  const setChoice = (id: string, choice: VoteChoice) => {
    setBallots((b) => {
      const next = { ...b };
      if (next[id] === choice) delete next[id];
      else next[id] = choice;
      return next;
    });
  };
  const setAll = (choice: VoteChoice) => {
    const next: Record<string, VoteChoice> = {};
    for (const d of voters) next[d.id] = choice;
    setBallots(next);
  };

  const record = () => {
    if (!canRecord) return;
    const passed = result.passed;
    dispatch({
      type: 'batch',
      actions: [
        {
          type: 'vote/record',
          subject: subjectText.trim(),
          procedural,
          threshold,
          counts,
          ballots: method === 'rollcall' ? ballots : null,
          now: Date.now(),
        },
        ...(extraActions?.(passed) ?? []),
      ],
    });
    onRecorded?.(passed);
    onClose();
  };

  return (
    <Modal
      wide
      title="Vote"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canRecord} onClick={record}>
            Record vote
          </Button>
        </>
      }
    >
      <div className="vote-modal">
        {editableSubject ? (
          <label className="vote-subject-field">
            <span className="vote-option-label">Voting on</span>
            <input type="text" autoFocus value={subjectText} onChange={(e) => setSubjectText(e.target.value)} />
          </label>
        ) : (
          <p className="vote-subject">Voting on: {subject}</p>
        )}

        <div className="vote-options">
          <Segmented
            label="Vote type"
            value={procedural ? 'procedural' : 'substantive'}
            options={[
              { value: 'procedural', label: 'Procedural' },
              { value: 'substantive', label: 'Substantive' },
            ]}
            onChange={(v) => setType(v === 'procedural')}
          />
          <Segmented
            label="Majority"
            value={threshold}
            options={[
              { value: 'simple', label: 'Simple majority' },
              { value: 'two_thirds', label: 'Two-thirds' },
            ]}
            onChange={setThreshold}
          />
          <Segmented
            label="Method"
            value={method}
            options={[
              { value: 'quick', label: 'Quick count' },
              { value: 'rollcall', label: 'Roll call' },
            ]}
            onChange={setMethod}
          />
        </div>
        <p className="muted vote-hint">
          {procedural
            ? 'Procedural: no abstentions.'
            : 'Substantive: abstentions allowed, except for delegates present and voting.'}
        </p>

        <p className="vote-eligible tabular muted">{n} delegates present</p>

        {method === 'quick' ? (
          <>
            <div className="vote-counters">
              <Counter label="For" value={quick.for} onChange={(v) => setQuick((q) => ({ ...q, for: v }))} />
              <Counter label="Against" value={quick.against} onChange={(v) => setQuick((q) => ({ ...q, against: v }))} />
              <Counter
                label="Abstain"
                value={quick.abstain}
                disabled={procedural}
                onChange={(v) => setQuick((q) => ({ ...q, abstain: v }))}
              />
            </div>
            <div className="vote-quick-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQuick((q) => ({ ...q, against: Math.max(0, n - q.for - q.abstain) }))}
              >
                Rest against
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQuick((q) => ({ ...q, for: Math.max(0, n - q.against - q.abstain) }))}
              >
                Rest for
              </Button>
            </div>
            {error ? (
              <p className="vote-error" role="alert">
                {error}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <div className="vote-roll-actions">
              <Button variant="secondary" size="sm" onClick={() => setAll('for')}>All for</Button>
              <Button variant="secondary" size="sm" onClick={() => setAll('against')}>All against</Button>
              <Button variant="ghost" size="sm" onClick={() => setBallots({})}>
                Clear
              </Button>
              <span className="tabular muted vote-roll-count">
                {voted} of {n} voted
              </span>
            </div>
            <div className="vote-list">
              {voters.map((d) => (
                <div key={d.id} className="vote-row">
                  <div className="vote-row-name">
                    <DelegateChip delegate={d} />
                    {d.attendance === 'present_voting' ? <span className="muted vote-tag">present &amp; voting</span> : null}
                  </div>
                  <div className="vote-seg" role="radiogroup" aria-label={`Vote of ${d.name}`}>
                    {CHOICES.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        role="radio"
                        aria-checked={ballots[d.id] === c.value}
                        className="vote-opt"
                        disabled={c.value === 'abstain' && !canAbstain(d, procedural)}
                        onClick={() => setChoice(d.id, c.value)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {voted < n ? <p className="muted vote-hint">Delegates who have not voted are not counted.</p> : null}
          </>
        )}

        <div className="vote-result" role="status">
          {result.cast === 0 ? (
            <span className="muted">No votes entered yet.</span>
          ) : (
            <span className="tabular">
              <strong className={result.passed ? 'vote-pass' : 'vote-fail'}>{result.passed ? 'PASSES' : 'FAILS'}</strong>
              <span className="muted">{` ${result.required} needed of ${result.cast} cast`}</span>
            </span>
          )}
          <span className="tabular muted">
            For {result.for}, against {result.against}, abstain {result.abstain}
          </span>
        </div>
      </div>
    </Modal>
  );
}
