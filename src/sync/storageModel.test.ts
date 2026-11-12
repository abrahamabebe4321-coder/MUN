import { describe, expect, it } from 'vitest';
import { reducer } from '../state/reducer';
import type { Action } from '../state/reducer';
import { createCommittee } from '../state/state';
import type { CommitteeState } from '../state/state';
import { FakeMap, FakeObject, fakeFactory } from './fakeLive';
import {
  applyDiff,
  initRoot,
  isStorageEmpty,
  mergeRemote,
  readStorage,
  sameCommittee,
  toStorageInit,
} from './storageModel';
import type { RootLike } from './storageModel';

const run = (s: CommitteeState, ...as: Action[]) => as.reduce(reducer, s);

function rich(): CommitteeState {
  return run(
    { ...createCommittee(), name: 'UNSC', topic: 'Water' },
    { type: 'delegate/add', id: 'ke', name: 'Kenya', flag: 'ke' },
    { type: 'delegate/add', id: 'in', name: 'India', flag: 'in' },
    { type: 'attendance/setAll', attendance: 'present' },
    { type: 'committee/setStage', stage: 'running' },
    { type: 'debate/start', mode: 'gsl', speakerSeconds: 60 } as Action,
    { type: 'interaction/add', delegateId: 'ke', kind: 'gsl_speech', tier: 2, now: 20 },
    { type: 'interaction/add', delegateId: 'in', kind: 'poi_asked', tier: 1, now: 10 },
    { type: 'motion/add', motionType: 'gsl', proposerId: 'ke' },
    { type: 'resolution/add', name: 'R1', sponsorIds: ['ke'] } as Action,
  );
}

function newRoot(state: CommitteeState): { root: FakeObject } {
  const root = new FakeObject();
  initRoot(root as RootLike, state, fakeFactory);
  return { root };
}

describe('storage model', () => {
  it('round-trips a committee through storage', () => {
    const s = rich();
    const { root } = newRoot(s);
    expect(isStorageEmpty(root)).toBe(false);
    const back = readStorage(root);
    expect(sameCommittee(back, s)).toBe(true);
    expect(back.interactions.map((i) => i.timestamp)).toEqual([10, 20]);
    expect(back.resolutions.map((r) => r.name)).toEqual(['R1']);
    expect(back.resolutions[0]).not.toHaveProperty('_o');
  });

  it('empty root is detected and reads as defaults', () => {
    const root = new FakeObject();
    expect(isStorageEmpty(root)).toBe(true);
    expect(sameCommittee(readStorage(root), createCommittee())).toBe(true);
  });

  it('toStorageInit is plain JSON keyed by id', () => {
    const init = toStorageInit(rich());
    expect(Object.keys(init.delegates).sort()).toEqual(['in', 'ke']);
    expect(init.meta.name).toBe('UNSC');
    expect(init.debate.mode).toBe('gsl');
    expect(() => JSON.stringify(init)).not.toThrow();
  });

  it('never stores the clientTag', () => {
    const tagged: CommitteeState = { ...rich(), clientTag: 'abc' };
    const { root } = newRoot(tagged);
    expect(readStorage(root)).not.toHaveProperty('clientTag');
    expect(JSON.stringify(toStorageInit(tagged))).not.toContain('abc');
  });

  it('older shapes load with defaults', () => {
    const root = new FakeObject();
    root.set('meta', new FakeObject({ name: 'Old', stage: 'running' }));
    root.set('debate', new FakeObject({ mode: 'gsl', speakersList: ['ke'] }));
    const s = readStorage(root);
    expect(s.name).toBe('Old');
    expect(s.session).toBe(1);
    expect(s.debate.mode).toBe('gsl');
    expect(s.debate.poiQueue).toEqual([]);
    expect(s.debate.speechTimer).toBeDefined();
  });

  it('applyDiff writes only what changed', () => {
    const a = rich();
    const { root } = newRoot(a);
    const b = run(a, { type: 'attendance/set', id: 'ke', attendance: 'absent' });
    const meta = root.get('meta') as FakeObject;
    const delegates = root.get('delegates') as FakeMap;
    const motions = root.get('motions') as FakeMap;
    meta.sets.length = 0;
    applyDiff(root, a, b);
    expect(delegates.ops).toEqual(['set ke']);
    expect(motions.ops).toEqual([]);
    expect(meta.sets).toEqual([]);
    expect(sameCommittee(readStorage(root), b)).toBe(true);
  });

  it('applyDiff deletes removed entries and sets meta and debate fields', () => {
    const a = rich();
    const { root } = newRoot(a);
    const id = a.interactions[0].id;
    const b = run(
      a,
      { type: 'interaction/remove', id },
      { type: 'committee/update', topic: 'Energy' },
      { type: 'speakers/add', id: 'ke' } as Action,
    );
    applyDiff(root, a, b);
    expect((root.get('interactions') as FakeMap).ops).toEqual([`delete ${id}`]);
    expect((root.get('meta') as FakeObject).get('topic')).toBe('Energy');
    expect(((root.get('debate') as FakeObject).get('speakersList') as string[])).toEqual(['ke']);
    expect(sameCommittee(readStorage(root), b)).toBe(true);
  });

  it('applyDiff does nothing for equal references or equal JSON', () => {
    const a = rich();
    const { root } = newRoot(a);
    applyDiff(root, a, a);
    applyDiff(root, a, JSON.parse(JSON.stringify(a)) as CommitteeState);
    expect((root.get('delegates') as FakeMap).ops).toEqual([]);
    expect((root.get('meta') as FakeObject).sets).toEqual([]);
  });

  it('concurrent edits to different things merge', () => {
    const base = rich();
    const { root } = newRoot(base);
    const A = run(base, { type: 'speakers/add', id: 'in' } as Action);
    const B = run(base, { type: 'attendance/set', id: 'ke', attendance: 'absent' });
    applyDiff(root, base, A);
    applyDiff(root, base, B);
    const merged = readStorage(root);
    expect(merged.debate.speakersList).toEqual(['in']);
    expect(merged.delegates.find((d) => d.id === 'ke')?.attendance).toBe('absent');
  });

  it('nextId only moves forward in storage', () => {
    const a = rich();
    const { root } = newRoot(a);
    const meta = root.get('meta') as FakeObject;
    meta.set('nextId', 100);
    applyDiff(root, a, { ...a, nextId: a.nextId + 1 });
    expect(meta.get('nextId')).toBe(100);
    applyDiff(root, a, { ...a, nextId: 150 });
    expect(meta.get('nextId')).toBe(150);
    expect(mergeRemote({ ...a, nextId: 3 }, { ...a, nextId: 9 }).nextId).toBe(9);
    expect(mergeRemote({ ...a, nextId: 12 }, { ...a, nextId: 9 }).nextId).toBe(12);
  });

  it('keeps resolution insertion order and preserves it on update', () => {
    let s = run(createCommittee(), { type: 'resolution/add', name: 'One', sponsorIds: [] } as Action);
    const { root } = newRoot(s);
    s = run(s, { type: 'resolution/add', name: 'Two', sponsorIds: [] } as Action);
    applyDiff(root, readStorage(root), s);
    const map = root.get('resolutions') as FakeMap;
    const firstId = [...map.data.keys()][0];
    const o = (map.get(firstId) as { _o: number })._o;
    const before = readStorage(root);
    const upd = { ...before, resolutions: before.resolutions.map((r, i) => (i === 0 ? { ...r, name: 'One!' } : r)) };
    applyDiff(root, before, upd);
    expect((map.get(firstId) as { _o: number })._o).toBe(o);
    expect(readStorage(root).resolutions.map((r) => r.name)).toEqual(['One!', 'Two']);
  });
});
