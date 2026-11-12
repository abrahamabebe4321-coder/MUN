import { describe, expect, it } from 'vitest';
import { createCommittee } from './state';
import {
  createEntry,
  deleteCommittee,
  findByRoom,
  lastActive,
  listCommittees,
  loadCommittee,
  resolveActive,
  saveCommittee,
  searchFor,
  setLastActive,
  setRoom,
} from './library';
import { ACTIVE_KEY, INDEX_KEY, LEGACY_ROOM_KEY, LEGACY_STATE_KEY, committeeKey } from './storage';

function fake() {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  };
}

const named = (name: string, topic = '') => ({ ...createCommittee(), name, topic });

describe('library', () => {
  it('creates committees under their own keys and lists them', () => {
    const st = fake();
    const id = createEntry({}, st);
    expect(id).toMatch(/^c-[a-z0-9]{8}$/);
    expect(st.data[committeeKey(id)]).toBeDefined();
    const index = JSON.parse(st.data[INDEX_KEY]) as unknown[];
    expect(index).toHaveLength(1);
    expect(listCommittees(st)[0]).toMatchObject({ id, name: '', topic: '', roomId: null });
    expect(loadCommittee(id, st)).toEqual(createCommittee());
  });

  it('saveCommittee updates name, topic and updatedAt and keeps the room', () => {
    const st = fake();
    const id = createEntry({ roomId: 'room-1' }, st);
    const before = listCommittees(st)[0].updatedAt;
    saveCommittee(id, named('GA', 'Veto'), st);
    const e = listCommittees(st)[0];
    expect(e).toMatchObject({ name: 'GA', topic: 'Veto', roomId: 'room-1' });
    expect(e.updatedAt).toBeGreaterThanOrEqual(before);
    expect(loadCommittee(id, st)?.name).toBe('GA');
  });

  it('keeps committees independent', () => {
    const st = fake();
    const a = createEntry({}, st);
    const b = createEntry({}, st);
    saveCommittee(a, named('A'), st);
    saveCommittee(b, named('B'), st);
    saveCommittee(a, named('A2'), st);
    expect(loadCommittee(b, st)?.name).toBe('B');
    expect(listCommittees(st).find((e) => e.id === b)?.name).toBe('B');
  });

  it('lists newest first', () => {
    const st = fake();
    const a = createEntry({}, st);
    const b = createEntry({}, st);
    const idx = JSON.parse(st.data[INDEX_KEY]) as Array<{ id: string; updatedAt: number }>;
    idx.find((e) => e.id === a)!.updatedAt = 10;
    idx.find((e) => e.id === b)!.updatedAt = 20;
    st.data[INDEX_KEY] = JSON.stringify(idx);
    expect(listCommittees(st).map((e) => e.id)).toEqual([b, a]);
  });

  it('setRoom and findByRoom', () => {
    const st = fake();
    const a = createEntry({}, st);
    const b = createEntry({}, st);
    setRoom(a, 'r1', st);
    expect(findByRoom('r1', st)?.id).toBe(a);
    expect(findByRoom('nope', st)).toBeNull();
    setRoom(a, null, st);
    expect(findByRoom('r1', st)).toBeNull();
    expect(listCommittees(st).find((e) => e.id === b)?.roomId).toBeNull();
  });

  it('deleteCommittee removes state, entry and a matching lastActive', () => {
    const st = fake();
    const a = createEntry({}, st);
    const b = createEntry({}, st);
    setLastActive(a, st);
    deleteCommittee(a, st);
    expect(st.data[committeeKey(a)]).toBeUndefined();
    expect(listCommittees(st).map((e) => e.id)).toEqual([b]);
    expect(st.data[ACTIVE_KEY]).toBeUndefined();
  });

  it('lastActive round trips', () => {
    const st = fake();
    expect(lastActive(st)).toBeNull();
    setLastActive('c-abcdefgh', st);
    expect(lastActive(st)).toBe('c-abcdefgh');
  });

  describe('migration', () => {
    it('moves the legacy committee and room into the library', () => {
      const st = fake();
      st.data[LEGACY_STATE_KEY] = JSON.stringify(named('Old', 'Topic'));
      st.data[LEGACY_ROOM_KEY] = 'mun-oldroom';
      const list = listCommittees(st);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ name: 'Old', topic: 'Topic', roomId: 'mun-oldroom' });
      expect(loadCommittee(list[0].id, st)?.name).toBe('Old');
      expect(st.data[LEGACY_STATE_KEY]).toBeUndefined();
      expect(st.data[LEGACY_ROOM_KEY]).toBeUndefined();
      expect(listCommittees(st)).toHaveLength(1); // only once
    });

    it('works without a legacy room', () => {
      const st = fake();
      st.data[LEGACY_STATE_KEY] = JSON.stringify(named('Old'));
      expect(listCommittees(st)[0].roomId).toBeNull();
    });

    it('does nothing when the index already exists', () => {
      const st = fake();
      st.data[INDEX_KEY] = '[]';
      st.data[LEGACY_STATE_KEY] = JSON.stringify(named('Old'));
      expect(listCommittees(st)).toEqual([]);
      expect(st.data[LEGACY_STATE_KEY]).toBeDefined();
    });
  });

  describe('resolveActive', () => {
    it('?room= uses the committee bound to that room', () => {
      const st = fake();
      const a = createEntry({}, st);
      const b = createEntry({ roomId: 'room-b' }, st);
      setLastActive(a, st);
      expect(resolveActive('?room=room-b', st)).toBe(b);
      expect(listCommittees(st)).toHaveLength(2);
    });

    it('unknown ?room= creates a new empty committee bound to it', () => {
      const st = fake();
      const a = createEntry({}, st);
      saveCommittee(a, named('Mine'), st);
      const id = resolveActive('?room=room-new', st);
      expect(id).not.toBe(a);
      expect(listCommittees(st).find((e) => e.id === id)?.roomId).toBe('room-new');
      expect(loadCommittee(id, st)?.delegates).toEqual([]);
      expect(loadCommittee(a, st)?.name).toBe('Mine');
      expect(resolveActive('?room=room-new', st)).toBe(id);
    });

    it('?c= wins over lastActive', () => {
      const st = fake();
      const a = createEntry({}, st);
      const b = createEntry({}, st);
      setLastActive(b, st);
      expect(resolveActive(`?c=${a}`, st)).toBe(a);
    });

    it('falls back to lastActive, then the newest, then creates one', () => {
      const st = fake();
      expect(listCommittees(st)).toEqual([]);
      const first = resolveActive('', st);
      expect(listCommittees(st)).toHaveLength(1);
      const a = createEntry({}, st);
      const b = createEntry({}, st);
      setLastActive(a, st);
      expect(resolveActive('?c=c-unknown1', st)).toBe(a);
      deleteCommittee(a, st);
      const idx = JSON.parse(st.data[INDEX_KEY]) as Array<{ id: string; updatedAt: number }>;
      idx.find((e) => e.id === b)!.updatedAt = Date.now() + 1000;
      st.data[INDEX_KEY] = JSON.stringify(idx);
      expect(resolveActive('', st)).toBe(b);
      expect(first).toMatch(/^c-/);
    });

    it('ignores an invalid room id', () => {
      const st = fake();
      const a = createEntry({}, st);
      expect(resolveActive('?room=bad%20room!', st)).toBe(a);
    });
  });

  it('searchFor carries c and the room when shared', () => {
    const st = fake();
    const a = createEntry({}, st);
    expect(searchFor(a, st)).toBe(`?c=${a}`);
    setRoom(a, 'r9', st);
    expect(searchFor(a, st)).toBe(`?c=${a}&room=r9`);
  });
});
