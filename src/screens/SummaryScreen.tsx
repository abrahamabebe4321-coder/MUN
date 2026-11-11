import { Button } from '../components/ui/Button';
import { DelegateChip } from '../components/ui/DelegateChip';
import { CATEGORY_LABELS, type Category } from '../domain/scoring';
import { buildSummary, summaryCsv } from '../domain/summary';
import type { Award, DelegateSummary } from '../domain/summary';
import { useCommittee } from '../state/CommitteeContext';
import './summary.css';

const CATEGORIES: Category[] = ['speeches', 'pois', 'procedure', 'resolutions', 'conduct'];
const OVERALL = new Set(['Best Delegate', 'Outstanding Delegate', 'Honourable Mention']);
const AWARD_CATEGORY: Record<string, Category> = {
  'Best Speaker': 'speeches',
  'Best Questioner': 'pois',
  'Best Resolution Work': 'resolutions',
};

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function pointsText(n: number): string {
  return `${n} ${Math.abs(n) === 1 ? 'point' : 'points'}`;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'committee'
  );
}

function Cell({ value }: { value: number }) {
  if (value === 0) return <td className="summary-num summary-zero">–</td>;
  return <td className={`summary-num${value < 0 ? ' summary-neg' : ''}`}>{value}</td>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="summary-stat">
      <span className="summary-stat-value">{value}</span>
      <span className="summary-stat-label">{label}</span>
    </div>
  );
}

function QualityMix({ d }: { d: DelegateSummary }) {
  const [t1, t2, t3] = [d.tierCounts[1], d.tierCounts[2], d.tierCounts[3]];
  const sum = t1 + t2 + t3;
  if (sum === 0) return null;
  return (
    <div
      className="summary-mix"
      role="img"
      aria-label={`Quality mix: ${t3} insightful, ${t2} decent, ${t1} works`}
    >
      {([
        [3, t3],
        [2, t2],
        [1, t1],
      ] as const).map(([tier, n]) =>
        n > 0 ? (
          <span key={tier} className={`summary-mix-${tier}`} style={{ flexGrow: n }} />
        ) : null,
      )}
    </div>
  );
}

export function SummaryScreen() {
  const { state, dispatch } = useCommittee();
  const summary = buildSummary(state);
  const { stats } = summary;
  const byId = new Map(summary.delegates.map((d) => [d.delegateId, d]));

  const download = () => {
    const blob = new Blob([summaryCsv(state)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugify(state.name)}-results.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const figure = (award: Award, d: DelegateSummary): number => {
    const cat = AWARD_CATEGORY[award.title];
    return OVERALL.has(award.title) || !cat ? d.total : d.byCategory[cat];
  };

  return (
    <main className="summary">
      <header className="summary-head">
        <div>
          <h1>Conference summary</h1>
          {state.name ? <p className="summary-committee">{state.name}</p> : null}
          {state.topic ? <p className="muted">{state.topic}</p> : null}
        </div>
        <div className="summary-actions">
          <Button onClick={() => dispatch({ type: 'committee/setStage', stage: 'running' })}>
            Reopen committee
          </Button>
          <Button variant="primary" onClick={download}>
            Download results (CSV)
          </Button>
          <Button onClick={() => window.print()}>Print summary</Button>
        </div>
      </header>

      <section className="summary-stats" aria-label="Committee statistics">
        <Stat label="Sessions" value={stats.sessions} />
        <Stat label="Delegates" value={stats.delegates} />
        <Stat label="Speeches" value={stats.speeches} />
        <Stat label="POIs" value={stats.pois} />
        <Stat
          label="Motions passed"
          value={`${stats.motionsPassed} of ${stats.motionsPassed + stats.motionsFailed}`}
        />
        <Stat label="Votes" value={stats.votes} />
        <Stat
          label="Resolutions passed"
          value={`${stats.resolutionsPassed} of ${stats.resolutionsTotal}`}
        />
      </section>

      <section className="summary-section" aria-labelledby="summary-awards-h">
        <h2 id="summary-awards-h">Awards</h2>
        {summary.awards.length === 0 ? (
          <p className="muted">No points were recorded, so there are no awards to suggest.</p>
        ) : (
          <div className="summary-awards">
            {summary.awards.map((a) => (
              <div key={a.title} className="card summary-award" role="group" aria-label={a.title}>
                <h3>{a.title}</h3>
                <ul>
                  {a.delegateIds.map((id) => {
                    const d = byId.get(id);
                    if (!d) return null;
                    return (
                      <li key={id}>
                        <DelegateChip delegate={d} size={32} />
                        <span className="summary-award-pts">{pointsText(figure(a, d))}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
        <p className="muted summary-note">
          Suggestions based on points — the final decision is the chair's.
        </p>
      </section>

      <section className="summary-section" aria-labelledby="summary-ranking-h">
        <h2 id="summary-ranking-h">Final ranking</h2>
        <div className="summary-scroll">
          <table className="summary-table">
            <thead>
              <tr>
                <th className="summary-left">#</th>
                <th className="summary-left">Delegate</th>
                <th>Points</th>
                {CATEGORIES.map((c) => (
                  <th key={c}>{CATEGORY_LABELS[c]}</th>
                ))}
                <th>Insightful</th>
                <th>Decent</th>
                <th>Works</th>
              </tr>
            </thead>
            <tbody>
              {summary.delegates.map((d) => (
                <tr key={d.delegateId}>
                  <td className="summary-left summary-num">{d.rank}</td>
                  <td className="summary-left">
                    <DelegateChip delegate={d} />
                  </td>
                  <td className={`summary-points${d.total < 0 ? ' summary-neg' : ''}`}>{d.total}</td>
                  {CATEGORIES.map((c) => (
                    <Cell key={c} value={d.byCategory[c]} />
                  ))}
                  <Cell value={d.tierCounts[3]} />
                  <Cell value={d.tierCounts[2]} />
                  <Cell value={d.tierCounts[1]} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="summary-section" aria-labelledby="summary-reports-h">
        <h2 id="summary-reports-h">Delegate reports</h2>
        <div className="summary-reports">
          {summary.delegates.map((d) => (
            <article
              key={d.delegateId}
              className="card summary-report"
              aria-label={`Report for ${d.name}`}
            >
              <header>
                <DelegateChip delegate={d} size={28} />
                <span className="muted">{`Rank ${d.rank} · ${pointsText(d.total)}`}</span>
              </header>
              <QualityMix d={d} />
              {d.kinds.length === 0 ? (
                <p className="muted">No recorded interactions.</p>
              ) : (
                <ul className="summary-kinds">
                  {d.kinds.map((k) => (
                    <li key={k.kind}>
                      <span>{`${k.label} × ${k.count}`}</span>
                      <span className={`summary-num${k.points < 0 ? ' summary-neg' : ''}`}>
                        {signed(k.points)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {d.notes.length > 0 ? (
                <div className="summary-notes">
                  <h4>Chair notes</h4>
                  <ul>
                    {d.notes.map((n, idx) => (
                      <li key={idx}>{n}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
