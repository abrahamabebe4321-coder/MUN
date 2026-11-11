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

/** Restore `snap` as present without rewinding clocks that are still live in `cur`. */
function restore(snap: CommitteeState, cur: CommitteeState): CommitteeState {
  if (snap.debate.mode !== cur.debate.mode) return snap;
  let caucusTimer = snap.debate.caucusTimer;
  if (caucusTimer !== null && cur.debate.caucusTimer !== null) caucusTimer = cur.debate.caucusTimer;
  const speechTimer =
    snap.debate.speechRef === cur.debate.speechRef ? cur.debate.speechTimer : snap.debate.speechTimer;
  if (caucusTimer === snap.debate.caucusTimer && speechTimer === snap.debate.speechTimer) return snap;
  return { ...snap, debate: { ...snap.debate, caucusTimer, speechTimer } };
}

export function historyReducer(h: History, action: HistoryAction): History {
  if (action.type === 'undo') {
    if (h.past.length === 0) return h;
    return {
      past: h.past.slice(0, -1),
      present: restore(h.past[h.past.length - 1], h.present),
      future: [h.present, ...h.future],
    };
  }
  if (action.type === 'redo') {
    if (h.future.length === 0) return h;
    return {
      past: [...h.past, h.present],
      present: restore(h.future[0], h.present),
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
