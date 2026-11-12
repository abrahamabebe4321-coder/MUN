import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import type { Action } from './reducer';
import { createHistory, historyReducer } from './history';
import { createCommittee } from './state';
import type { CommitteeState } from './state';
import { useLiveSync } from '../sync/useLiveSync';
import type { SyncApi } from '../sync/useLiveSync';
import { committeeKey, loadState } from './storage';
import { createEntry, lastActive, loadCommittee, saveCommittee } from './library';

interface CommitteeContextValue {
  state: CommitteeState;
  dispatch: (a: Action) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  sync: SyncApi;
  /** Id of the local committee this provider shows. */
  cid: string;
  /** Show another local committee in this tab (no-op when the provider has no switcher). */
  switchTo: (cid: string) => void;
}

const CommitteeContext = createContext<CommitteeContextValue | null>(null);

export function CommitteeProvider({
  children,
  initial,
  cid: cidProp,
  onSwitch,
}: {
  children: ReactNode;
  initial?: CommitteeState;
  /** Local committee to show; omitted only in tests (an ephemeral committee is created). */
  cid?: string;
  onSwitch?: (cid: string) => void;
}) {
  const [cid] = useState(() => cidProp ?? createEntry({ state: initial }));
  const [history, dispatchHistory] = useReducer(historyReducer, undefined, () =>
    createHistory(initial ?? loadCommittee(cid) ?? createCommittee()),
  );

  useEffect(() => {
    saveCommittee(cid, history.present);
  }, [cid, history.present]);

  const switchTo = useCallback((next: string) => onSwitch?.(next), [onSwitch]);

  const dispatch = useCallback((a: Action) => dispatchHistory(a), []);
  const dispatchRemote = useCallback(
    (state: CommitteeState) => dispatchHistory({ type: 'sync/remote', state }),
    [],
  );
  const dispatchTag = useCallback((tag: string) => dispatchHistory({ type: 'sync/tag', tag }), []);
  const sync = useLiveSync(cid, history.present, dispatchRemote, dispatchTag);
  const undo = useCallback(() => dispatchHistory({ type: 'undo' }), []);
  const redo = useCallback(() => dispatchHistory({ type: 'redo' }), []);

  const value = useMemo<CommitteeContextValue>(
    () => ({
      state: history.present,
      dispatch,
      undo,
      redo,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      sync,
      cid,
      switchTo,
    }),
    [history, dispatch, undo, redo, sync, cid, switchTo],
  );

  return (
    <CommitteeContext.Provider value={value}>
      {children}
    </CommitteeContext.Provider>
  );
}

export function useCommittee(): CommitteeContextValue {
  const ctx = useContext(CommitteeContext);
  if (!ctx) throw new Error('useCommittee must be used within a CommitteeProvider');
  return ctx;
}

/** The committee a projector window shows: `?c=` from its URL, else the last active one. */
export function projectorCid(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('c') ?? lastActive();
  } catch {
    return null;
  }
}

/** Read-only view of a persisted committee, for a second window (projector). */
export function useStoredCommittee(cid: string | null = projectorCid()): CommitteeState | null {
  const [stored, setStored] = useState<CommitteeState | null>(() => (cid ? loadState(cid) : null));
  useEffect(() => {
    if (!cid) return;
    setStored(loadState(cid));
    const key = committeeKey(cid);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key || e.key === null) setStored(loadState(cid));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [cid]);
  return stored;
}
