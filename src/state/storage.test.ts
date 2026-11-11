import { describe, expect, it } from 'vitest';
import { createCommittee } from './state';
import { exportJson, importJson, loadState, parseState, saveState, STORAGE_KEY } from './storage';

function fakeStorage() {
  const data: Record<string, string> = {};
  return {
    data,
    setItem: (k: string, v: string) => void (data[k] = v),
    getItem: (k: string) => (k in data ? data[k] : null),
  };
}

describe('storage', () => {
  it('round trips', () => {
    const st = fakeStorage();
    const s = { ...createCommittee(), name: 'X' };
    saveState(s, st);
    expect(st.data[STORAGE_KEY]).toBeDefined();
    expect(loadState(st)).toEqual(s);
  });

  it('loads older saves that lack pinnedLastId and poiQueue', () => {
    const old = JSON.parse(JSON.stringify(createCommittee())) as { debate: Record<string, unknown> };
    delete old.debate.pinnedLastId;
    delete old.debate.poiQueue;
    const s = parseState(old);
    expect(s?.debate.pinnedLastId).toBeNull();
    expect(s?.debate.poiQueue).toEqual([]);
  });

  it('returns null for missing or bad data', () => {
    const st = fakeStorage();
    expect(loadState(st)).toBeNull();
    st.setItem(STORAGE_KEY, '{nope');
    expect(loadState(st)).toBeNull();
    st.setItem(STORAGE_KEY, '{"version":2}');
    expect(loadState(st)).toBeNull();
  });

  it('save swallows exceptions', () => {
    expect(() => saveState(createCommittee(), { setItem: () => { throw new Error('full'); } })).not.toThrow();
  });

  it('load swallows exceptions', () => {
    expect(loadState({ getItem: () => { throw new Error('denied'); } })).toBeNull();
  });

  it('parseState validates shape', () => {
    const good = createCommittee();
    expect(parseState(good)).toEqual(good);
    const bad: unknown[] = [
      null, 5, [], 'x',
      { ...good, version: 2 },
      { ...good, name: 1 },
      { ...good, topic: null },
      { ...good, stage: 'weird' },
      { ...good, session: '1' },
      { ...good, nextId: undefined },
      { ...good, delegates: {} },
      { ...good, interactions: null },
      { ...good, motions: 1 },
      { ...good, votes: 1 },
      { ...good, resolutions: 1 },
      { ...good, scoring: null },
      { ...good, debate: [] },
    ];
    for (const b of bad) expect(parseState(b)).toBeNull();
  });

  it('export/import', () => {
    const s = { ...createCommittee(), name: 'Y' };
    const text = exportJson(s);
    expect(text).toContain('\n');
    expect(importJson(text)).toEqual(s);
    expect(importJson('garbage')).toBeNull();
    expect(importJson('{"a":1}')).toBeNull();
  });
});
