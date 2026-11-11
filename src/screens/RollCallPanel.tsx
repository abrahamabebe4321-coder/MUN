import { useEffect, useState } from 'react';
import { useCommittee } from '../state/CommitteeContext';
import { quorum } from '../domain/voting';
import type { Attendance } from '../domain/types';
import { Button } from '../components/ui/Button';
import { DelegateChip } from '../components/ui/DelegateChip';
import './rollcall.css';

const OPTIONS: { value: Attendance; label: string; key: string }[] = [
  { value: 'absent', label: 'Absent', key: 'a' },
  { value: 'present', label: 'Present', key: 'p' },
  { value: 'present_voting', label: 'Present & voting', key: 'v' },
];

export function RollCallPanel() {
  const { state, dispatch } = useCommittee();
  const { delegates } = state;
  const q = quorum(delegates);
  const [open, setOpen] = useState(false);
  const [called, setCalled] = useState<string[]>([]);

  const current = delegates.find((d) => !called.includes(d.id)) ?? null;
  const currentId = current?.id ?? null;

  const call = (attendance: Attendance) => {
    if (!currentId) return;
    dispatch({ type: 'attendance/set', id: currentId, attendance });
    setCalled((c) => [...c, currentId]);
  };

  useEffect(() => {
    if (!open || !currentId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const opt = OPTIONS.find((o) => o.key === e.key.toLowerCase());
      if (!opt) return;
      e.preventDefault();
      dispatch({ type: 'attendance/set', id: currentId, attendance: opt.value });
      setCalled((c) => [...c, currentId]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, currentId, dispatch]);

  const start = () => {
    setCalled([]);
    setOpen(true);
  };

  return (
    <section className="rollcall" aria-label="Roll call">
      <div className="row rollcall-header">
        <h2 className="rollcall-title">Roll call</h2>
        <span className="muted">{`Session ${state.session}`}</span>
        <span className="grow" />
        <Button onClick={() => dispatch({ type: 'attendance/setAll', attendance: 'present' })}>
          All present
        </Button>
        <Button onClick={() => dispatch({ type: 'attendance/setAll', attendance: 'present_voting' })}>
          All present & voting
        </Button>
        <Button onClick={() => dispatch({ type: 'attendance/setAll', attendance: 'absent' })}>Clear</Button>
      </div>

      <div className="card rollcall-summary" aria-label="Attendance summary">
        {q.total === 0 ? (
          <span className="muted">No delegations</span>
        ) : (
          <>
            <span className="tabular">{`Present: ${q.present} / ${q.total}`}</span>
            <span className="tabular">{`Present & voting: ${q.presentVoting}`}</span>
            <span className="tabular">{`Absent: ${q.absent}`}</span>
            <span className="tabular">{`Simple majority: ${q.simpleMajority}`}</span>
            <span className="tabular">{`Two-thirds majority: ${q.twoThirds}`}</span>
            <span className={`badge ${q.hasQuorum ? 'rollcall-ok' : 'rollcall-warn'}`}>
              {q.hasQuorum ? 'Quorum met' : 'No quorum'}
            </span>
          </>
        )}
      </div>

      {!open ? (
        <div>
          <Button variant="primary" onClick={start} disabled={delegates.length === 0}>
            Call the roll one by one
          </Button>
        </div>
      ) : (
        <div className="card rollcall-stepper col">
          <div className="row">
            <strong>Call the roll</strong>
            <span className="grow" />
            <Button variant="ghost" size="sm" onClick={() => setCalled([])}>
              Restart
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
          {current ? (
            <>
              <div className="rollcall-current">
                <DelegateChip delegate={current} size={48} />
              </div>
              <div className="muted tabular">{`${called.length + 1} of ${delegates.length}`}</div>
              <div className="row rollcall-actions">
                {OPTIONS.map((o) => (
                  <Button
                    key={o.value}
                    size="lg"
                    variant={o.value === 'absent' ? 'secondary' : 'primary'}
                    onClick={() => call(o.value)}
                  >
                    {o.label} <kbd>{o.key.toUpperCase()}</kbd>
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <p className="rollcall-complete">Roll call complete.</p>
          )}
        </div>
      )}

      <div className="rollcall-list">
        {delegates.map((d) => (
          <div key={d.id} className={`rollcall-row${d.attendance === 'absent' ? ' rollcall-row-absent' : ''}`}>
            <div className="grow">
              <DelegateChip delegate={d} />
            </div>
            <div className="rollcall-seg" role="radiogroup" aria-label={`Attendance for ${d.name}`}>
              {OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={d.attendance === o.value}
                  className={`rollcall-opt rollcall-opt-${o.value}`}
                  onClick={() => dispatch({ type: 'attendance/set', id: d.id, attendance: o.value })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
