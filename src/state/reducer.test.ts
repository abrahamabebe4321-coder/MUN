import { describe, expect, it } from 'vitest';
import { reducer, peekId } from './reducer';
import type { Action } from './reducer';
import { createCommittee, DEFAULT_SPEAKER_SECONDS } from './state';
import type { CommitteeState } from './state';

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

function run(s: CommitteeState, ...actions: Action[]): CommitteeState {
  return actions.reduce((acc, a) => reducer(deepFreeze(acc), a), s);
}

function withDelegates(...ids: string[]): CommitteeState {
  return run(
    createCommittee(),
    ...ids.map((id): Action => ({ type: 'delegate/add', id, name: id.toUpperCase(), flag: id })),
  );
}

describe('createCommittee', () => {
  it('has sensible defaults and deep-copied scoring', () => {
    const a = createCommittee();
    expect(a.stage).toBe('setup');
    expect(a.session).toBe(1);
    expect(a.nextId).toBe(1);
    expect(a.debate.mode).toBe('none');
    expect(a.debate.speakerSeconds).toBe(DEFAULT_SPEAKER_SECONDS);
    a.scoring.base.sponsor = 99;
    expect(createCommittee().scoring.base.sponsor).toBe(5);
  });
});

describe('committee', () => {
  it('updates name/topic and stage', () => {
    const s = run(createCommittee(), { type: 'committee/update', name: 'UNSC' }, { type: 'committee/update', topic: 'Peace' }, { type: 'committee/setStage', stage: 'running' });
    expect(s).toMatchObject({ name: 'UNSC', topic: 'Peace', stage: 'running' });
  });
});

describe('delegates', () => {
  it('adds sorted by name, mints custom ids, ignores duplicates', () => {
    let s = run(createCommittee(), { type: 'delegate/add', id: 'fr', name: 'France', flag: 'fr' }, { type: 'delegate/add', id: 'de', name: 'Germany', flag: 'de' }, { type: 'delegate/add', name: 'Atlantis', flag: null });
    expect(s.delegates.map((d) => d.name)).toEqual(['Atlantis', 'France', 'Germany']);
    expect(s.delegates[0].id).toBe('custom-1');
    expect(s.delegates[0].attendance).toBe('absent');
    expect(s.nextId).toBe(2);
    const dup = reducer(s, { type: 'delegate/add', id: 'fr', name: 'X', flag: null });
    expect(dup).toBe(s);
    s = run(s, { type: 'delegate/add', name: 'Zed', flag: null });
    expect(s.delegates.some((d) => d.id === 'custom-2')).toBe(true);
  });

  it('removal cascades', () => {
    let s = withDelegates('a', 'b', 'c');
    s = run(
      s,
      { type: 'interaction/add', delegateId: 'a', kind: 'gsl_speech', tier: 1, now: 1 },
      { type: 'interaction/add', delegateId: 'b', kind: 'gsl_speech', tier: 1, now: 2 },
      { type: 'resolution/add', name: 'R', sponsorIds: ['a'], signatoryIds: ['b', 'c'] },
      { type: 'debate/start', mode: 'gsl' },
      { type: 'speakers/add', id: 'a' },
      { type: 'speakers/add', id: 'b' },
      { type: 'speakers/add', id: 'c' },
      { type: 'speakers/next' },
      { type: 'speakers/next' },
    );
    expect(s.debate.currentSpeakerId).toBe('b');
    expect(s.debate.spoken).toEqual(['a']);
    const r = run(s, { type: 'delegate/remove', id: 'a' });
    expect(r.delegates.map((d) => d.id)).toEqual(['b', 'c']);
    expect(r.interactions.map((i) => i.delegateId)).toEqual(['b']);
    expect(r.debate.spoken).toEqual([]);
    expect(r.resolutions[0].sponsorIds).toEqual([]);
    const r2 = run(s, { type: 'delegate/remove', id: 'b' });
    expect(r2.debate.currentSpeakerId).toBeNull();
    expect(r2.resolutions[0].signatoryIds).toEqual(['c']);
    const r3 = run(s, { type: 'delegate/remove', id: 'c' });
    expect(r3.debate.speakersList).toEqual([]);
  });

  it('sets attendance', () => {
    let s = withDelegates('a', 'b');
    s = run(s, { type: 'attendance/set', id: 'a', attendance: 'present' });
    expect(s.delegates[0].attendance).toBe('present');
    s = run(s, { type: 'attendance/setAll', attendance: 'present_voting' });
    expect(s.delegates.every((d) => d.attendance === 'present_voting')).toBe(true);
    expect(reducer(s, { type: 'attendance/set', id: 'zz', attendance: 'absent' })).toBe(s);
  });
});

describe('session/next', () => {
  it('resets debate, attendance and pending motions', () => {
    let s = withDelegates('a');
    s = run(
      s,
      { type: 'attendance/setAll', attendance: 'present' },
      { type: 'motion/add', motionType: 'gsl', proposerId: 'a' },
      { type: 'motion/add', motionType: 'mod', proposerId: 'a' },
      { type: 'motion/setStatus', id: 'm1', status: 'passed' },
      { type: 'debate/start', mode: 'mod', speakerSeconds: 45 },
      { type: 'speakers/add', id: 'a' },
      { type: 'session/next' },
    );
    expect(s.session).toBe(2);
    expect(s.delegates[0].attendance).toBe('absent');
    expect(s.motions.map((m) => m.status)).toEqual(['passed', 'withdrawn']);
    expect(s.debate.mode).toBe('none');
    expect(s.debate.speakersList).toEqual([]);
    expect(s.debate.speakerSeconds).toBe(45);
  });
});

describe('interactions', () => {
  it('adds with defaults and ignores unknown delegates', () => {
    let s = withDelegates('a');
    s = run(s, { type: 'interaction/add', delegateId: 'a', kind: 'poi_asked', tier: 2, now: 77 });
    expect(s.interactions[0]).toMatchObject({ id: 'i1', passed: false, note: '', session: 1, timestamp: 77, tier: 2 });
    expect('refId' in s.interactions[0]).toBe(false);
    expect(s.nextId).toBe(2);
    expect(reducer(s, { type: 'interaction/add', delegateId: 'x', kind: 'poi_asked', tier: 1, now: 1 })).toBe(s);
  });

  it('updates and removes', () => {
    let s = withDelegates('a', 'b');
    s = run(s, { type: 'interaction/add', delegateId: 'a', kind: 'poi_asked', tier: 1, now: 1 });
    s = run(s, { type: 'interaction/update', id: 'i1', patch: { tier: 3, note: 'n', delegateId: 'b' } });
    expect(s.interactions[0]).toMatchObject({ tier: 3, note: 'n', delegateId: 'b' });
    expect(reducer(s, { type: 'interaction/update', id: 'nope', patch: { tier: 1 } })).toBe(s);
    expect(reducer(s, { type: 'interaction/update', id: 'i1', patch: { delegateId: 'zz' } })).toBe(s);
    expect(reducer(s, { type: 'interaction/remove', id: 'nope' })).toBe(s);
    expect(run(s, { type: 'interaction/remove', id: 'i1' }).interactions).toEqual([]);
  });
});

describe('scoring', () => {
  it('sets scoring', () => {
    const s = createCommittee();
    const scoring = { ...s.scoring, base: { ...s.scoring.base, penalty: -5 } };
    expect(run(s, { type: 'scoring/set', scoring }).scoring.base.penalty).toBe(-5);
  });
});

describe('motions', () => {
  it('adds with defaults', () => {
    let s = withDelegates('a');
    s = run(s, { type: 'motion/add', motionType: 'mod', proposerId: 'a', topic: 'T', totalSeconds: 600, speakerSeconds: 30 });
    expect(s.motions[0]).toMatchObject({ id: 'm1', status: 'pending', raisedOrder: 1, session: 1, topic: 'T', totalSeconds: 600, speakerSeconds: 30 });
    s = run(s, { type: 'motion/add', motionType: 'adjourn', proposerId: 'a' });
    expect(s.motions[1]).toMatchObject({ id: 'm2', raisedOrder: 2, topic: '', totalSeconds: 0, speakerSeconds: 0 });
    expect(reducer(s, { type: 'motion/add', motionType: 'gsl', proposerId: 'zz' })).toBe(s);
  });

  it('status syncs interaction.passed via refId', () => {
    let s = withDelegates('a');
    s = run(
      s,
      { type: 'motion/add', motionType: 'gsl', proposerId: 'a' },
      { type: 'interaction/add', delegateId: 'a', kind: 'motion_raised', tier: 1, refId: 'm1', now: 1 },
      { type: 'interaction/add', delegateId: 'a', kind: 'motion_raised', tier: 1, now: 1 },
      { type: 'motion/setStatus', id: 'm1', status: 'passed' },
    );
    expect(s.motions[0].status).toBe('passed');
    expect(s.interactions.map((i) => i.passed)).toEqual([true, false]);
    s = run(s, { type: 'motion/setStatus', id: 'm1', status: 'failed' });
    expect(s.interactions[0].passed).toBe(false);
    expect(reducer(s, { type: 'motion/setStatus', id: 'zz', status: 'passed' })).toBe(s);
  });

  it('removal cascades and clearPending', () => {
    let s = withDelegates('a');
    s = run(
      s,
      { type: 'motion/add', motionType: 'gsl', proposerId: 'a' },
      { type: 'motion/add', motionType: 'mod', proposerId: 'a' },
      { type: 'interaction/add', delegateId: 'a', kind: 'motion_raised', tier: 1, refId: 'm1', now: 1 },
    );
    const cleared = run(s, { type: 'motion/clearPending' });
    expect(cleared.motions.every((m) => m.status === 'withdrawn')).toBe(true);
    expect(reducer(cleared, { type: 'motion/clearPending' })).toBe(cleared);
    const removed = run(s, { type: 'motion/remove', id: 'm1' });
    expect(removed.motions.map((m) => m.id)).toEqual(['m2']);
    expect(removed.interactions).toEqual([]);
    expect(reducer(s, { type: 'motion/remove', id: 'zz' })).toBe(s);
  });
});

describe('votes', () => {
  it('records with computed result and removes', () => {
    let s = createCommittee();
    s = run(
      s,
      { type: 'vote/record', subject: 'A', procedural: false, threshold: 'simple', counts: { for: 5, against: 4, abstain: 3 }, now: 9 },
      { type: 'vote/record', subject: 'B', procedural: false, threshold: 'two_thirds', counts: { for: 5, against: 4, abstain: 0 }, ballots: { a: 'for' }, now: 10 },
    );
    expect(s.votes[0]).toMatchObject({ id: 'v1', passed: true, ballots: null, timestamp: 9, session: 1, abstain: 3 });
    expect(s.votes[1]).toMatchObject({ id: 'v2', passed: false, ballots: { a: 'for' } });
    expect(run(s, { type: 'vote/remove', id: 'v1' }).votes.map((v) => v.id)).toEqual(['v2']);
    expect(reducer(s, { type: 'vote/remove', id: 'zz' })).toBe(s);
  });
});

describe('debate and speakers', () => {
  it('starts a caucus with timers not running', () => {
    const s = run(createCommittee(), { type: 'debate/start', mode: 'mod', topic: 'T', totalSeconds: 300, speakerSeconds: 30 });
    expect(s.debate).toMatchObject({ mode: 'mod', topic: 'T', speakerSeconds: 30, resolutionId: null });
    expect(s.debate.caucusTimer).toEqual({ durationMs: 300000, elapsedMs: 0, startedAt: null });
    expect(s.debate.speechTimer.durationMs).toBe(30000);
    expect(s.debate.speechTimer.startedAt).toBeNull();
  });

  it('defaults caucus to 600s, none for gsl, keeps previous speakerSeconds', () => {
    let s = run(createCommittee(), { type: 'debate/start', mode: 'unmod' });
    expect(s.debate.caucusTimer?.durationMs).toBe(600000);
    s = run(s, { type: 'debate/start', mode: 'gsl', speakerSeconds: 90 }, { type: 'debate/start', mode: 'resolution', resolutionId: 'r1' });
    expect(s.debate.caucusTimer).toBeNull();
    expect(s.debate.speakerSeconds).toBe(90);
    expect(s.debate.resolutionId).toBe('r1');
  });

  it('ends debate keeping speakerSeconds', () => {
    const s = run(createCommittee(), { type: 'debate/start', mode: 'gsl', speakerSeconds: 20 }, { type: 'debate/end' });
    expect(s.debate.mode).toBe('none');
    expect(s.debate.speakerSeconds).toBe(20);
  });

  it('queue add/remove/move', () => {
    let s = withDelegates('a', 'b', 'c');
    s = run(s, { type: 'speakers/add', id: 'a' }, { type: 'speakers/add', id: 'b' }, { type: 'speakers/add', id: 'c' });
    expect(reducer(s, { type: 'speakers/add', id: 'a' })).toBe(s);
    expect(reducer(s, { type: 'speakers/add', id: 'zz' })).toBe(s);
    expect(s.debate.speakersList).toEqual(['a', 'b', 'c']);
    s = run(s, { type: 'speakers/move', id: 'c', direction: -1 });
    expect(s.debate.speakersList).toEqual(['a', 'c', 'b']);
    s = run(s, { type: 'speakers/move', id: 'a', direction: 1 });
    expect(s.debate.speakersList).toEqual(['c', 'a', 'b']);
    expect(reducer(s, { type: 'speakers/move', id: 'c', direction: -1 })).toBe(s);
    expect(reducer(s, { type: 'speakers/move', id: 'b', direction: 1 })).toBe(s);
    expect(reducer(s, { type: 'speakers/move', id: 'zz', direction: 1 })).toBe(s);
    s = run(s, { type: 'speakers/remove', id: 'a' });
    expect(s.debate.speakersList).toEqual(['c', 'b']);
    expect(reducer(s, { type: 'speakers/remove', id: 'a' })).toBe(s);
  });

  it('next advances, records spoken and resets timer', () => {
    let s = withDelegates('a', 'b');
    s = run(s, { type: 'debate/start', mode: 'gsl', speakerSeconds: 40 }, { type: 'speakers/add', id: 'a' }, { type: 'speakers/add', id: 'b' }, { type: 'speakers/next' });
    expect(s.debate.currentSpeakerId).toBe('a');
    expect(s.debate.speakersList).toEqual(['b']);
    expect(reducer(s, { type: 'speakers/add', id: 'a' })).toBe(s);
    s = run(s, { type: 'timer', which: 'speech', op: 'start', now: 100 });
    expect(s.debate.speechTimer.startedAt).toBe(100);
    s = run(s, { type: 'speakers/next' });
    expect(s.debate).toMatchObject({ currentSpeakerId: 'b', spoken: ['a'], speakersList: [] });
    expect(s.debate.speechTimer).toEqual({ durationMs: 40000, elapsedMs: 0, startedAt: null });
    s = run(s, { type: 'speakers/next' });
    expect(s.debate).toMatchObject({ currentSpeakerId: null, spoken: ['a', 'b'] });
  });

  it('setCurrent picks a delegate, removing from queue', () => {
    let s = withDelegates('a', 'b', 'c');
    s = run(s, { type: 'speakers/add', id: 'a' }, { type: 'speakers/add', id: 'b' }, { type: 'speakers/setCurrent', id: 'b' });
    expect(s.debate.currentSpeakerId).toBe('b');
    expect(s.debate.speakersList).toEqual(['a']);
    s = run(s, { type: 'speakers/setCurrent', id: 'c' });
    expect(s.debate).toMatchObject({ currentSpeakerId: 'c', spoken: ['b'], speakersList: ['a'] });
    s = run(s, { type: 'speakers/setCurrent', id: null });
    expect(s.debate).toMatchObject({ currentSpeakerId: null, spoken: ['b', 'c'], speakersList: ['a'] });
    expect(reducer(s, { type: 'speakers/setCurrent', id: 'zz' })).toBe(s);
  });
});

describe('timer', () => {
  const base = () => run(createCommittee(), { type: 'debate/start', mode: 'mod', totalSeconds: 100, speakerSeconds: 30 });

  it('start/pause/toggle/reset on speech', () => {
    let s = run(base(), { type: 'timer', which: 'speech', op: 'start', now: 1000 });
    expect(s.debate.speechTimer.startedAt).toBe(1000);
    s = run(s, { type: 'timer', which: 'speech', op: 'pause', now: 3000 });
    expect(s.debate.speechTimer).toMatchObject({ elapsedMs: 2000, startedAt: null });
    s = run(s, { type: 'timer', which: 'speech', op: 'toggle', now: 4000 });
    expect(s.debate.speechTimer.startedAt).toBe(4000);
    s = run(s, { type: 'timer', which: 'speech', op: 'reset', now: 5000 });
    expect(s.debate.speechTimer).toMatchObject({ elapsedMs: 0, startedAt: null });
  });

  it('add and set on caucus', () => {
    let s = run(base(), { type: 'timer', which: 'caucus', op: 'add', seconds: 20, now: 0 });
    expect(s.debate.caucusTimer?.durationMs).toBe(120000);
    s = run(s, { type: 'timer', which: 'caucus', op: 'start', now: 0 }, { type: 'timer', which: 'caucus', op: 'set', seconds: 50, now: 10 });
    expect(s.debate.caucusTimer).toEqual({ durationMs: 50000, elapsedMs: 0, startedAt: null });
    expect(s.debate.speakerSeconds).toBe(30);
  });

  it('set on speech updates speakerSeconds', () => {
    const s = run(base(), { type: 'timer', which: 'speech', op: 'set', seconds: 75, now: 0 });
    expect(s.debate.speakerSeconds).toBe(75);
    expect(s.debate.speechTimer.durationMs).toBe(75000);
  });

  it('caucus op with null caucusTimer is a no-op', () => {
    const s = createCommittee();
    expect(reducer(s, { type: 'timer', which: 'caucus', op: 'start', now: 1 })).toBe(s);
  });
});

describe('speechRef', () => {
  const gsl = () =>
    run(withDelegates('a', 'b', 'c'), { type: 'debate/start', mode: 'gsl' }, { type: 'speakers/add', id: 'a' }, { type: 'speakers/add', id: 'b' });

  it('is null when idle and at debate start', () => {
    expect(createCommittee().debate.speechRef).toBeNull();
    expect(gsl().debate.speechRef).toBeNull();
  });

  it('mints a unique ref per speaker and consumes nextId', () => {
    let s = gsl();
    const id0 = s.nextId;
    s = run(s, { type: 'speakers/next' });
    expect(s.debate.speechRef).toBe(`s${id0}`);
    expect(s.nextId).toBe(id0 + 1);
    const first = s.debate.speechRef;
    s = run(s, { type: 'speakers/next' });
    expect(s.debate.speechRef).toBe(`s${id0 + 1}`);
    expect(s.debate.speechRef).not.toBe(first);
    s = run(s, { type: 'speakers/setCurrent', id: 'c' });
    expect(s.debate.speechRef).toBe(`s${id0 + 2}`);
  });

  it('clears on null speaker without touching nextId', () => {
    let s = run(gsl(), { type: 'speakers/next' });
    const n = s.nextId;
    s = run(s, { type: 'speakers/next' }, { type: 'speakers/next' });
    expect(s.debate.currentSpeakerId).toBeNull();
    expect(s.debate.speechRef).toBeNull();
    expect(s.nextId).toBe(n + 1);
    s = run(s, { type: 'speakers/setCurrent', id: 'a' }, { type: 'speakers/setCurrent', id: null });
    expect(s.debate.speechRef).toBeNull();
  });

  it('clears on debate start and on removal of the current speaker', () => {
    let s = run(gsl(), { type: 'speakers/next' });
    expect(s.debate.speechRef).not.toBeNull();
    expect(run(s, { type: 'delegate/remove', id: 'b' }).debate.speechRef).toBe(s.debate.speechRef);
    expect(run(s, { type: 'delegate/remove', id: 'a' }).debate.speechRef).toBeNull();
    s = run(s, { type: 'debate/start', mode: 'mod' });
    expect(s.debate.speechRef).toBeNull();
  });
});

describe('timer both', () => {
  const mod = () => run(createCommittee(), { type: 'debate/start', mode: 'mod', totalSeconds: 100, speakerSeconds: 30 });

  it('start/pause/toggle drive both timers', () => {
    let s = run(mod(), { type: 'timer', which: 'both', op: 'start', now: 1000 });
    expect(s.debate.speechTimer.startedAt).toBe(1000);
    expect(s.debate.caucusTimer?.startedAt).toBe(1000);
    s = run(s, { type: 'timer', which: 'both', op: 'pause', now: 3000 });
    expect(s.debate.speechTimer).toMatchObject({ elapsedMs: 2000, startedAt: null });
    expect(s.debate.caucusTimer).toMatchObject({ elapsedMs: 2000, startedAt: null });
    s = run(s, { type: 'timer', which: 'both', op: 'toggle', now: 4000 });
    expect(s.debate.speechTimer.startedAt).toBe(4000);
    expect(s.debate.caucusTimer?.startedAt).toBe(4000);
    s = run(s, { type: 'timer', which: 'both', op: 'toggle', now: 5000 });
    expect(s.debate.speechTimer.startedAt).toBeNull();
    expect(s.debate.caucusTimer?.startedAt).toBeNull();
  });

  it('works without a caucus timer', () => {
    let s = run(createCommittee(), { type: 'debate/start', mode: 'gsl' });
    s = run(s, { type: 'timer', which: 'both', op: 'start', now: 10 });
    expect(s.debate.speechTimer.startedAt).toBe(10);
    expect(s.debate.caucusTimer).toBeNull();
    s = run(s, { type: 'timer', which: 'both', op: 'toggle', now: 20 });
    expect(s.debate.speechTimer).toMatchObject({ elapsedMs: 10, startedAt: null });
    expect(s.debate.caucusTimer).toBeNull();
  });

  it('toggle follows the speech timer when they disagree', () => {
    let s = run(mod(), { type: 'timer', which: 'caucus', op: 'start', now: 0 });
    s = run(s, { type: 'timer', which: 'both', op: 'toggle', now: 50 });
    expect(s.debate.speechTimer.startedAt).toBe(50);
    expect(s.debate.caucusTimer?.startedAt).toBe(0);
  });

  it('unsupported ops return the same state', () => {
    const s = mod();
    for (const op of ['reset', 'add', 'set'] as const) {
      expect(reducer(s, { type: 'timer', which: 'both', op, seconds: 5, now: 1 })).toBe(s);
    }
  });
});

describe('resolutions', () => {
  it('adds, enforces sponsor/signatory exclusivity', () => {
    let s = withDelegates('a', 'b', 'c');
    s = run(s, { type: 'resolution/add', name: 'R', sponsorIds: ['a'], signatoryIds: ['b'] });
    expect(s.resolutions[0]).toMatchObject({ id: 'r1', status: 'draft', amendments: [] });
    s = run(s, { type: 'resolution/update', id: 'r1', patch: { sponsorIds: ['a', 'b'] } });
    expect(s.resolutions[0].signatoryIds).toEqual([]);
    s = run(s, { type: 'resolution/update', id: 'r1', patch: { signatoryIds: ['a', 'c'] } });
    expect(s.resolutions[0].signatoryIds).toEqual(['c']);
    s = run(s, { type: 'resolution/update', id: 'r1', patch: { name: 'New', status: 'presented' } });
    expect(s.resolutions[0]).toMatchObject({ name: 'New', status: 'presented', signatoryIds: ['c'] });
    expect(reducer(s, { type: 'resolution/update', id: 'zz', patch: {} })).toBe(s);
  });

  it('amendments add/status/remove with interaction sync', () => {
    let s = withDelegates('a');
    s = run(
      s,
      { type: 'resolution/add', name: 'R' },
      { type: 'amendment/add', resolutionId: 'r1', proposerId: 'a', description: 'd' },
    );
    expect(s.resolutions[0].amendments[0]).toEqual({ id: 'a2', proposerId: 'a', description: 'd', status: 'pending' });
    s = run(s, { type: 'interaction/add', delegateId: 'a', kind: 'amendment_proposed', tier: 1, refId: 'a2', now: 1 });
    s = run(s, { type: 'amendment/setStatus', resolutionId: 'r1', id: 'a2', status: 'passed' });
    expect(s.resolutions[0].amendments[0].status).toBe('passed');
    expect(s.interactions[0].passed).toBe(true);
    s = run(s, { type: 'amendment/setStatus', resolutionId: 'r1', id: 'a2', status: 'failed' });
    expect(s.interactions[0].passed).toBe(false);
    const removed = run(s, { type: 'amendment/remove', resolutionId: 'r1', id: 'a2' });
    expect(removed.resolutions[0].amendments).toEqual([]);
    expect(removed.interactions).toEqual([]);
    expect(reducer(s, { type: 'amendment/add', resolutionId: 'zz', proposerId: 'a', description: '' })).toBe(s);
    expect(reducer(s, { type: 'amendment/setStatus', resolutionId: 'r1', id: 'zz', status: 'passed' })).toBe(s);
    expect(reducer(s, { type: 'amendment/remove', resolutionId: 'zz', id: 'a2' })).toBe(s);
  });

  it('removal cascades to amendment interactions and debate.resolutionId', () => {
    let s = withDelegates('a');
    s = run(
      s,
      { type: 'resolution/add', name: 'R' },
      { type: 'amendment/add', resolutionId: 'r1', proposerId: 'a', description: 'd' },
      { type: 'interaction/add', delegateId: 'a', kind: 'amendment_proposed', tier: 1, refId: 'a2', now: 1 },
      { type: 'interaction/add', delegateId: 'a', kind: 'gsl_speech', tier: 1, now: 1 },
      { type: 'debate/start', mode: 'resolution', resolutionId: 'r1' },
      { type: 'resolution/remove', id: 'r1' },
    );
    expect(s.resolutions).toEqual([]);
    expect(s.interactions.map((i) => i.kind)).toEqual(['gsl_speech']);
    expect(s.debate.resolutionId).toBeNull();
    expect(reducer(s, { type: 'resolution/remove', id: 'r1' })).toBe(s);
  });
});

describe('replace and batch', () => {
  it('replaces state', () => {
    const other = withDelegates('x');
    expect(reducer(createCommittee(), { type: 'state/replace', state: other })).toBe(other);
  });

  it('batch applies in order and peekId references minted ids', () => {
    let s = withDelegates('a');
    const id = peekId(s, 'm');
    expect(id).toBe('m1');
    s = run(s, {
      type: 'batch',
      actions: [
        { type: 'motion/add', motionType: 'gsl', proposerId: 'a' },
        { type: 'interaction/add', delegateId: 'a', kind: 'motion_raised', tier: 1, refId: id, now: 1 },
        { type: 'motion/setStatus', id, status: 'passed' },
      ],
    });
    expect(s.motions[0].id).toBe('m1');
    expect(s.interactions[0]).toMatchObject({ id: 'i2', refId: 'm1', passed: true });
    expect(s.nextId).toBe(3);
  });

  it('batch of no-ops returns the same reference', () => {
    const s = createCommittee();
    expect(reducer(s, { type: 'batch', actions: [{ type: 'motion/remove', id: 'x' }] })).toBe(s);
  });
});

describe('unknown ids', () => {
  it('return the same reference', () => {
    const s = withDelegates('a');
    const actions: Action[] = [
      { type: 'delegate/remove', id: 'zz' },
      { type: 'interaction/remove', id: 'zz' },
      { type: 'motion/setStatus', id: 'zz', status: 'passed' },
      { type: 'speakers/add', id: 'zz' },
      { type: 'resolution/update', id: 'zz', patch: {} },
    ];
    for (const a of actions) expect(reducer(s, a)).toBe(s);
  });
});

describe('proposer speaks last and POI queue', () => {
  const base = () => {
    let s = createCommittee();
    for (const id of ['a', 'b', 'c', 'd']) s = reducer(s, { type: 'delegate/add', id, name: id.toUpperCase(), flag: null });
    return reducer(s, { type: 'debate/start', mode: 'mod', topic: 'T' });
  };
  const list = (s: ReturnType<typeof base>) => s.debate.speakersList;

  it('stores proposerSpeaks on motions', () => {
    let s = base();
    s = reducer(s, { type: 'motion/add', motionType: 'mod', proposerId: 'a', topic: 'x', proposerSpeaks: 'last' });
    s = reducer(s, { type: 'motion/add', motionType: 'mod', proposerId: 'a', topic: 'x' });
    expect(s.motions[0].proposerSpeaks).toBe('last');
    expect(s.motions[1].proposerSpeaks).toBeUndefined();
  });

  it('pinLast inserts later speakers before the pinned one', () => {
    let s = base();
    s = reducer(s, { type: 'speakers/add', id: 'a' });
    s = reducer(s, { type: 'speakers/pinLast', id: 'a' });
    s = reducer(s, { type: 'speakers/add', id: 'b' });
    s = reducer(s, { type: 'speakers/add', id: 'c' });
    expect(list(s)).toEqual(['b', 'c', 'a']);
    expect(s.debate.pinnedLastId).toBe('a');
  });

  it('pinLast ignores ids not in the list; null unpins; move keeps pin', () => {
    let s = base();
    expect(reducer(s, { type: 'speakers/pinLast', id: 'a' })).toBe(s);
    s = reducer(s, { type: 'speakers/add', id: 'a' });
    s = reducer(s, { type: 'speakers/add', id: 'b' });
    s = reducer(s, { type: 'speakers/pinLast', id: 'b' });
    s = reducer(s, { type: 'speakers/move', id: 'b', direction: -1 });
    expect(s.debate.pinnedLastId).toBe('b');
    s = reducer(s, { type: 'speakers/pinLast', id: null });
    expect(s.debate.pinnedLastId).toBeNull();
  });

  it('clears the pin when the pinned delegate leaves the list', () => {
    const pinned = () => {
      let s = base();
      s = reducer(s, { type: 'speakers/add', id: 'a' });
      s = reducer(s, { type: 'speakers/pinLast', id: 'a' });
      return s;
    };
    expect(reducer(pinned(), { type: 'speakers/remove', id: 'a' }).debate.pinnedLastId).toBeNull();
    expect(reducer(pinned(), { type: 'speakers/next' }).debate.pinnedLastId).toBeNull();
    expect(reducer(pinned(), { type: 'speakers/setCurrent', id: 'a' }).debate.pinnedLastId).toBeNull();
    expect(reducer(pinned(), { type: 'delegate/remove', id: 'a' }).debate.pinnedLastId).toBeNull();
    // someone else speaking keeps the pin
    let s = reducer(pinned(), { type: 'speakers/add', id: 'b' });
    s = reducer(s, { type: 'speakers/setCurrent', id: 'b' });
    expect(s.debate.pinnedLastId).toBe('a');
  });

  it('debate/start resets pin and queue', () => {
    let s = base();
    s = reducer(s, { type: 'speakers/add', id: 'a' });
    s = reducer(s, { type: 'speakers/pinLast', id: 'a' });
    s = reducer(s, { type: 'debate/start', mode: 'gsl' });
    expect(s.debate.pinnedLastId).toBeNull();
    expect(s.debate.poiQueue).toEqual([]);
  });

  it('poi/queue appends known, new, non-speaker delegates in order', () => {
    let s = base();
    s = reducer(s, { type: 'speakers/setCurrent', id: 'a' });
    s = reducer(s, { type: 'poi/queue', id: 'b' });
    s = reducer(s, { type: 'poi/queue', id: 'c' });
    s = reducer(s, { type: 'poi/queue', id: 'b' });
    s = reducer(s, { type: 'poi/queue', id: 'a' });
    s = reducer(s, { type: 'poi/queue', id: 'zz' });
    expect(s.debate.poiQueue).toEqual(['b', 'c']);
    s = reducer(s, { type: 'poi/unqueue', id: 'b' });
    expect(s.debate.poiQueue).toEqual(['c']);
    expect(reducer(s, { type: 'poi/unqueue', id: 'b' })).toBe(s);
  });

  it('poi queue resets on a new speech and drops removed delegates', () => {
    let s = base();
    s = reducer(s, { type: 'speakers/setCurrent', id: 'a' });
    s = reducer(s, { type: 'poi/queue', id: 'b' });
    s = reducer(s, { type: 'poi/queue', id: 'c' });
    s = reducer(s, { type: 'delegate/remove', id: 'b' });
    expect(s.debate.poiQueue).toEqual(['c']);
    expect(reducer(s, { type: 'speakers/next' }).debate.poiQueue).toEqual([]);
    expect(reducer(s, { type: 'speakers/setCurrent', id: 'd' }).debate.poiQueue).toEqual([]);
  });
});
