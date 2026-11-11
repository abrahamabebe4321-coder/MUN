import { useState } from 'react';
import { useCommittee } from '../state/CommitteeContext';
import { derivedInteractions, ranking } from '../state/selectors';
import {
  CATEGORY_LABELS,
  KIND_LABELS,
  TIER_LABELS,
  scoreInteraction,
  type Category,
} from '../domain/scoring';
import type { Interaction, Tier } from '../domain/types';
import { Button } from '../components/ui/Button';
import { DelegateChip } from '../components/ui/DelegateChip';
import { Modal } from '../components/ui/Modal';
import './leaderboard.css';

const CATEGORIES: Category[] = ['speeches', 'pois', 'procedure', 'resolutions', 'conduct'];
const TIERS: Tier[] = [1, 2, 3];

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function Cell({ value }: { value: number }) {
  if (value === 0) return <td className="lb-num lb-zero">–</td>;
  return <td className={`lb-num${value < 0 ? ' lb-neg' : ''}`}>{value}</td>;
}

export function LeaderboardPanel() {
  const { state, dispatch } = useCommittee();
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = ranking(state);
  const byId = new Map(state.delegates.map((d) => [d.id, d]));
  const recent = state.interactions.slice(-15).reverse();

  return (
    <section className="lb" aria-label="Leaderboard">
      <div className="lb-head">
        <h2>Scores</h2>
        <p className="muted">Private to the chair. Never shown on the projector.</p>
      </div>

      {rows.length === 0 ? (
        <p className="muted">No delegations.</p>
      ) : (
        <div className="lb-scroll">
          <table className="lb-table">
            <thead>
              <tr>
                <th className="lb-left">#</th>
                <th className="lb-left">Delegate</th>
                <th>Points</th>
                {CATEGORIES.map((c) => (
                  <th key={c}>{CATEGORY_LABELS[c]}</th>
                ))}
                <th>Insightful</th>
                <th>Decent</th>
                <th>Works</th>
                <th>Entries</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = byId.get(r.delegateId);
                const cls = [
                  r.total > 0 && r.rank <= 3 ? `lb-rank-${r.rank}` : '',
                  d?.attendance === 'absent' ? 'lb-absent' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <tr key={r.delegateId} className={cls} onClick={() => setOpenId(r.delegateId)}>
                    <td className="lb-left lb-num lb-rank">{r.rank}</td>
                    <td className="lb-left">
                      <button
                        type="button"
                        className="lb-name"
                        aria-label={`Show log for ${r.name}`}
                      >
                        <DelegateChip delegate={d ?? { name: r.name, flag: null }} />
                      </button>
                    </td>
                    <td className={`lb-points${r.total < 0 ? ' lb-neg' : ''}`}>{r.total}</td>
                    {CATEGORIES.map((c) => (
                      <Cell key={c} value={r.byCategory[c]} />
                    ))}
                    <Cell value={r.tierCounts[3]} />
                    <Cell value={r.tierCounts[2]} />
                    <Cell value={r.tierCounts[1]} />
                    <td className="lb-num">{r.count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <details className="lb-recent">
        <summary>{`Recent activity (${recent.length})`}</summary>
        {recent.length === 0 ? (
          <p className="muted">Nothing logged yet.</p>
        ) : (
          <ul>
            {recent.map((i) => {
              const d = byId.get(i.delegateId);
              const name = d?.name ?? i.delegateId;
              const flat = state.scoring.flatKinds.includes(i.kind);
              const pts = scoreInteraction(i, state.scoring);
              return (
                <li key={i.id}>
                  <DelegateChip delegate={d ?? { name, flag: null }} />
                  <span>{KIND_LABELS[i.kind]}</span>
                  {flat ? null : <span className="lb-tier muted">{TIER_LABELS[i.tier]}</span>}
                  <span className={`lb-pts tabular${pts < 0 ? ' lb-neg' : ''}`}>{signed(pts)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${KIND_LABELS[i.kind]} for ${name}`}
                    onClick={() => dispatch({ type: 'interaction/remove', id: i.id })}
                  >
                    ✕
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </details>

      {openId ? <DelegateLogModal delegateId={openId} onClose={() => setOpenId(null)} /> : null}
    </section>
  );
}

function NoteInput({ interaction }: { interaction: Interaction }) {
  const { dispatch } = useCommittee();
  const [value, setValue] = useState(interaction.note);
  return (
    <input
      type="text"
      aria-label="Note"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== interaction.note) {
          dispatch({ type: 'interaction/update', id: interaction.id, patch: { note: value } });
        }
      }}
    />
  );
}

export function DelegateLogModal({
  delegateId,
  onClose,
}: {
  delegateId: string;
  onClose: () => void;
}) {
  const { state, dispatch } = useCommittee();
  const row = ranking(state).find((r) => r.delegateId === delegateId);
  const name = row?.name ?? delegateId;
  const total = row?.total ?? 0;

  const synthetic = (i: Interaction) => i.id.startsWith('sponsor:') || i.id.startsWith('signatory:');
  const items = derivedInteractions(state)
    .map((i, idx) => ({ i, idx }))
    .filter(({ i }) => i.delegateId === delegateId)
    .sort((a, b) => {
      const sa = synthetic(a.i);
      const sb = synthetic(b.i);
      if (sa !== sb) return sa ? 1 : -1;
      return b.i.timestamp - a.i.timestamp || b.idx - a.idx;
    })
    .map(({ i }) => i);

  const summary = row
    ? CATEGORIES.filter((c) => row.byCategory[c] !== 0)
        .map((c) => `${CATEGORY_LABELS[c]} ${row.byCategory[c]}`)
        .join(', ')
    : '';

  return (
    <Modal wide title={`${name}, ${total} ${Math.abs(total) === 1 ? 'point' : 'points'}`} onClose={onClose}>
      {summary ? <p className="muted lb-summary">{summary}</p> : null}
      {items.length === 0 ? (
        <p className="muted">No interactions recorded for this delegate.</p>
      ) : (
        <div className="lb-log-scroll">
          <table className="lb-table lb-log">
            <thead>
              <tr>
                <th>Session</th>
                <th>Type</th>
                <th>Quality</th>
                <th>Passed</th>
                <th>Points</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const syn = synthetic(i);
                const flat = state.scoring.flatKinds.includes(i.kind);
                const pts = scoreInteraction(i, state.scoring);
                return (
                  <tr key={i.id}>
                    <td>{i.session}</td>
                    <td>{KIND_LABELS[i.kind]}</td>
                    <td>
                      {syn || flat ? (
                        '–'
                      ) : (
                        <select
                          aria-label={`Quality for ${KIND_LABELS[i.kind]}`}
                          value={i.tier}
                          onChange={(e) =>
                            dispatch({
                              type: 'interaction/update',
                              id: i.id,
                              patch: { tier: Number(e.target.value) as Tier },
                            })
                          }
                        >
                          {TIERS.map((t) => (
                            <option key={t} value={t}>
                              {TIER_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>{i.passed ? 'Yes' : ''}</td>
                    <td className={`lb-num${pts < 0 ? ' lb-neg' : ''}`}>{signed(pts)}</td>
                    <td>{syn ? i.note : <NoteInput key={i.note} interaction={i} />}</td>
                    <td>
                      {syn ? null : (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${KIND_LABELS[i.kind]}`}
                          onClick={() => dispatch({ type: 'interaction/remove', id: i.id })}
                        >
                          ✕
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
