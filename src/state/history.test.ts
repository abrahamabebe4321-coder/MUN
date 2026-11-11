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

  describe('undo keeps live timers', () => {
    const setup = () =>
      run(
        createHistory(
          run(createHistory(createCommittee()), { type: 'delegate/add', id: 'a', name: 'A', flag: null }, { type: 'debate/start', mode: 'mod', totalSeconds: 100 }, { type: 'speakers/setCurrent', id: 'a' }).present,
        ),
      );

    it('does not rewind the speech timer across an interaction undo', () => {
      let h = run(setup(), { type: 'timer', which: 'speech', op: 'start', now: 1000 });
      h = run(h, { type: 'interaction/add', delegateId: 'a', kind: 'mod_speech', tier: 1, now: 2000 });
      h = run(h, { type: 'timer', which: 'speech', op: 'pause', now: 4000 });
      h = run(h, { type: 'undo' });
      expect(h.present.interactions).toHaveLength(0);
      expect(h.present.debate.speechTimer).toMatchObject({ elapsedMs: 3000, startedAt: null });
      const snap = h.future[0];
      h = run(h, { type: 'redo' });
      expect(h.present.interactions).toHaveLength(1);
      expect(h.present.debate.speechTimer).toMatchObject({ elapsedMs: 3000, startedAt: null });
      expect(snap.interactions).toHaveLength(1);
    });

    it('keeps the caucus timer live and does not mutate snapshots', () => {
      let h = run(setup(), { type: 'committee/update', name: 'x' });
      const snapCaucus = h.past[h.past.length - 1].debate.caucusTimer;
      h = run(h, { type: 'timer', which: 'caucus', op: 'start', now: 500 });
      h = run(h, { type: 'undo' });
      expect(h.present.name).toBe('');
      expect(h.present.debate.caucusTimer?.startedAt).toBe(500);
      expect(snapCaucus?.startedAt).toBeNull();
    });

    it("restores the snapshot's own speech timer across a speaker change", () => {
      let h = run(setup(), { type: 'delegate/add', id: 'b', name: 'B', flag: null });
      h = run(h, { type: 'timer', which: 'speech', op: 'start', now: 100 });
      const before = h.present.debate.speechTimer;
      h = run(h, { type: 'speakers/setCurrent', id: 'b' });
      h = run(h, { type: 'timer', which: 'speech', op: 'start', now: 900 });
      h = run(h, { type: 'undo' });
      expect(h.present.debate.currentSpeakerId).toBe('a');
      expect(h.present.debate.speechTimer).toEqual(before);
    });

    it('restores the snapshot untouched when the mode differs', () => {
      let h = run(setup(), { type: 'debate/start', mode: 'gsl' });
      h = run(h, { type: 'undo' });
      expect(h.present.debate.mode).toBe('mod');
      expect(h.present.debate.caucusTimer).not.toBeNull();
    });
  });
});
