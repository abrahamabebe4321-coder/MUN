import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import type { Action } from './reducer';
import { createHistory, historyReducer } from './history';
import { createCommittee } from './state';
import type { CommitteeState } from './state';
import { loadState, saveState, STORAGE_KEY } from './storage';

interface CommitteeContextValue {
  state: CommitteeState;
  dispatch: (a: Action) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const CommitteeContext = createContext<CommitteeContextValue | null>(null);

export function CommitteeProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: CommitteeState;
}) {
  const [history, dispatchHistory] = useReducer(historyReducer, undefined, () =>
    createHistory(initial ?? loadState() ?? createCommittee()),
  );

  useEffect(() => {
    saveState(history.present);
  }, [history.present]);

  const dispatch = useCallback((a: Action) => dispatchHistory(a), []);
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
    }),
    [history, dispatch, undo, redo],
  );

  return <CommitteeContext.Provider value={value}>{children}</CommitteeContext.Provider>;
}

export function useCommittee(): CommitteeContextValue {
  const ctx = useContext(CommitteeContext);
  if (!ctx) throw new Error('useCommittee must be used within a CommitteeProvider');
  return ctx;
}

/** Read-only view of the persisted committee, for a second window (projector). */
export function useStoredCommittee(): CommitteeState | null {
  const [stored, setStored] = useState<CommitteeState | null>(() => loadState());
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) setStored(loadState());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return stored;
}
