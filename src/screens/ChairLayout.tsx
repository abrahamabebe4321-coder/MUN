import { useCallback, useEffect, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { quorum } from '../domain/voting';
import { useCommittee } from '../state/CommitteeContext';
import { NavContext } from './nav';
import { TABS } from './tabs';
import type { TabId } from './tabs';
import './chair.css';

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

export function ChairLayout() {
  const { state, dispatch, undo, redo, canUndo, canRedo } = useCommittee();
  const q = quorum(state.delegates);
  const [tab, setTab] = useState<TabId>(() => (q.present === 0 ? 'rollcall' : 'debate'));
  const [confirm, setConfirm] = useState<null | 'next' | 'end'>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (isEditable(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const navigate = useCallback((t: string) => {
    if (TABS.some((x) => x.id === t)) setTab(t as TabId);
  }, []);

  const next = state.session + 1;
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <>
      <header className="chair-topbar">
        <div className="chair-title">
          <span className="chair-name">{state.name}</span>
          <span className="chair-topic" title={state.topic}>{state.topic}</span>
        </div>
        <div className="chair-badges">
          <span className="badge">{`Session ${state.session}`}</span>
          <span className={`badge${q.hasQuorum ? '' : ' chair-badge-warn'}`}>
            {`${q.present}/${q.total} present`}
            {q.hasQuorum ? '' : ' · No quorum'}
          </span>
        </div>
        <div className="chair-actions">
          <Button size="sm" disabled={!canUndo} title="Undo (Ctrl+Z)" onClick={undo}>Undo</Button>
          <Button size="sm" disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" onClick={redo}>Redo</Button>
          <Button
            size="sm"
            onClick={() =>
              window.open(`${window.location.pathname}#/projector`, 'mun-projector', 'popup,width=1280,height=720')
            }
          >
            Projector
          </Button>
          <Button size="sm" onClick={() => setConfirm('next')}>Next session</Button>
          <Button size="sm" variant="danger" onClick={() => setConfirm('end')}>End conference</Button>
        </div>
      </header>

      <div className="chair-tabs" role="tablist" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`chair-tab-${t.id}`}
            aria-selected={t.id === tab}
            aria-controls="chair-panel"
            className="chair-tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        className="chair-panel"
        role="tabpanel"
        id="chair-panel"
        aria-labelledby={`chair-tab-${active.id}`}
      >
        <NavContext.Provider value={navigate}>{active.render()}</NavContext.Provider>
      </div>

      {confirm === 'next' && (
        <Modal
          title="Next session"
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button onClick={() => setConfirm(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  dispatch({ type: 'session/next' });
                  setTab('rollcall');
                  setConfirm(null);
                }}
              >
                {`Start session ${next}`}
              </Button>
            </>
          }
        >
          <p>
            {`Start session ${next}? Attendance is cleared for a new roll call and motions still on the floor are withdrawn.`}
          </p>
        </Modal>
      )}
      {confirm === 'end' && (
        <Modal
          title="End conference"
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button onClick={() => setConfirm(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  dispatch({ type: 'committee/setStage', stage: 'ended' });
                  setConfirm(null);
                }}
              >
                End conference
              </Button>
            </>
          }
        >
          <p>End the conference and show the performance summary? You can reopen it afterwards.</p>
        </Modal>
      )}
    </>
  );
}
