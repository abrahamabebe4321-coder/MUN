import { useCallback, useEffect, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Menu } from '../components/ui/Menu';
import { Modal } from '../components/ui/Modal';
import { quorum } from '../domain/voting';
import { useCommittee } from '../state/CommitteeContext';
import { getProjectorScreen, popupFeatures } from '../projectorScreen';
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

  const selectedTab = active.inBar ? active : null;
  const noQuorum = !q.hasQuorum;

  return (
    <>
      <div className="chair-header">
        <div className="chair-inner">
        <header className="chair-topbar">
          <div className="chair-title">
            <span className="chair-name">{state.name}</span>
            <span className="chair-topic" title={state.topic}>{state.topic}</span>
          </div>
          <div className="chair-actions">
            <span className="chair-session">{`Session ${state.session}`}</span>
            <Button
              variant="ghost"
              size="sm"
              className={`chair-attendance${noQuorum ? ' chair-warn' : ''}`}
              aria-label={`Attendance: ${q.present} of ${q.total} present. Open roll call`}
              onClick={() => setTab('rollcall')}
            >
              {`${q.present} of ${q.total} present${noQuorum ? ' (no quorum)' : ''}`}
            </Button>
            <Button size="sm" disabled={!canUndo} title="Undo (Ctrl+Z)" onClick={undo}>Undo</Button>
            <Button
              size="sm"
              onClick={() => {
                // open synchronously (user activation), then move to the projector display
                const win = window.open(
                  `${window.location.pathname}#/projector`,
                  'mun-projector',
                  popupFeatures(null),
                );
                void getProjectorScreen().then((s) => {
                  if (s && win && !win.closed) {
                    try {
                      win.moveTo(s.availLeft, s.availTop);
                      win.resizeTo(s.availWidth, s.availHeight);
                    } catch {
                      // not permitted
                    }
                  }
                });
              }}
            >
              Projector
            </Button>
            <Menu
              label="More"
              align="right"
              variant="secondary"
              size="sm"
              items={[
                { label: 'Redo', onSelect: redo, disabled: !canRedo, hint: 'Ctrl+Shift+Z' },
                { label: 'Roll call', onSelect: () => setTab('rollcall') },
                { label: 'Settings', onSelect: () => setTab('settings') },
                { label: 'Next session', onSelect: () => setConfirm('next') },
                { label: 'End conference', onSelect: () => setConfirm('end'), danger: true },
              ]}
            />
          </div>
        </header>

        <div className="chair-tabs" role="tablist" aria-label="Sections">
          {TABS.filter((t) => t.inBar).map((t) => (
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
        </div>
      </div>

      <div
        className="chair-panel"
        role="tabpanel"
        id="chair-panel"
        aria-labelledby={selectedTab ? `chair-tab-${selectedTab.id}` : undefined}
        aria-label={selectedTab ? undefined : active.label}
      >
        {selectedTab ? null : (
          <Button variant="ghost" size="sm" className="chair-back" onClick={() => setTab('debate')}>
            Back to debate
          </Button>
        )}
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
                className="btn-solid"
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
