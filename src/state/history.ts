import { reducer } from './reducer';
import type { Action } from './reducer';
import type { CommitteeState } from './state';

export interface History {
  past: CommitteeState[];
  present: CommitteeState;
  future: CommitteeState[];
}

export type HistoryAction = Action | { type: 'undo' } | { type: 'redo' };

export const HISTORY_LIMIT = 100;

export function createHistory(present: CommitteeState): History {
  return { past: [], present, future: [] };
}

export function historyReducer(h: History, action: HistoryAction): History {
  if (action.type === 'undo') {
    if (h.past.length === 0) return h;
    return {
      past: h.past.slice(0, -1),
      present: h.past[h.past.length - 1],
      future: [h.present, ...h.future],
    };
  }
  if (action.type === 'redo') {
    if (h.future.length === 0) return h;
    return {
      past: [...h.past, h.present],
      present: h.future[0],
      future: h.future.slice(1),
    };
  }
  const next = reducer(h.present, action);
  if (next === h.present) return h;
  if (action.type === 'timer') return { ...h, present: next };
  if (action.type === 'state/replace') return { past: [], present: next, future: [] };
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, present: next, future: [] };
}
