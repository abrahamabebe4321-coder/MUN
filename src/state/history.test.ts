import { describe, expect, it } from 'vitest';
import { createHistory, historyReducer, HISTORY_LIMIT } from './history';
import type { HistoryAction } from './history';
import { createCommittee } from './state';

const h0 = () => createHistory(createCommittee());
const run = (h = h0(), ...a: HistoryAction[]) => a.reduce(historyReducer, h);

describe('history', () => {
  it('undo/redo', () => {
    let h = run(h0(), { type: 'committee/update', name: 'A' }, { type: 'committee/update', name: 'B' });
    expect(h.past).toHaveLength(2);
    h = run(h, { type: 'undo' });
    expect(h.present.name).toBe('A');
    expect(h.future).toHaveLength(1);
    h = run(h, { type: 'undo' });
    expect(h.present.name).toBe('');
    h = run(h, { type: 'redo' }, { type: 'redo' });
    expect(h.present.name).toBe('B');
  });

  it('undo/redo no-op when empty', () => {
    const h = h0();
    expect(historyReducer(h, { type: 'undo' })).toBe(h);
    expect(historyReducer(h, { type: 'redo' })).toBe(h);
  });

  it('new action clears future', () => {
    let h = run(h0(), { type: 'committee/update', name: 'A' }, { type: 'undo' });
    h = run(h, { type: 'committee/update', name: 'C' });
    expect(h.future).toEqual([]);
  });

  it('timer actions are not recorded and keep future', () => {
    let h = run(h0(), { type: 'committee/update', name: 'A' }, { type: 'undo' });
    h = run(h, { type: 'timer', which: 'speech', op: 'start', now: 5 });
    expect(h.past).toHaveLength(0);
    expect(h.future).toHaveLength(1);
    expect(h.present.debate.speechTimer.startedAt).toBe(5);
  });

  it('no-op actions are not recorded', () => {
    const h = h0();
    expect(historyReducer(h, { type: 'motion/remove', id: 'zz' })).toBe(h);
    expect(historyReducer(h, { type: 'timer', which: 'caucus', op: 'start', now: 1 })).toBe(h);
  });

  it('trims to the limit, dropping oldest', () => {
    let h = h0();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = run(h, { type: 'committee/update', name: `n${i}` });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0].name).toBe('n9');
  });

  it('replace clears past and future', () => {
    let h = run(h0(), { type: 'committee/update', name: 'A' }, { type: 'committee/update', name: 'B' }, { type: 'undo' });
    const other = createCommittee();
    h = run(h, { type: 'state/replace', state: other });
    expect(h).toEqual({ past: [], present: other, future: [] });
  });
});
