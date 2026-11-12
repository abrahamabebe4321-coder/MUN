import { createCommittee } from './state';
import type { CommitteeState } from './state';
import {
  ACTIVE_KEY,
  INDEX_KEY,
  LEGACY_ROOM_KEY,
  LEGACY_STATE_KEY,
  committeeKey,
  loadState,
  parseState,
  saveState,
} from './storage';

export interface CommitteeEntry {
  id: string;
  name: string;
  topic: string;
  roomId: string | null;
  updatedAt: number;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const ROOM_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CID_RE = /^c-[a-z0-9]{8}$/;

export function newCid(): string {
  let out = '';
  while (out.length < 8) out += Math.floor(Math.random() * 36 ** 6).toString(36);
  return `c-${out.slice(0, 8)}`;
}

function isEntry(v: unknown): v is CommitteeEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.name === 'string' &&
    typeof e.topic === 'string' &&
    (e.roomId === null || typeof e.roomId === 'string') &&
    typeof e.updatedAt === 'number'
  );
}

function readIndex(storage: Store): CommitteeEntry[] {
  try {
    const raw = storage.getItem(INDEX_KEY);
    if (raw === null) return [];
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(isEntry) : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: CommitteeEntry[], storage: Store): void {
  try {
    storage.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch {
    // storage unavailable or full; ignore
  }
}

function migrate(storage: Store): void {
  try {
    if (storage.getItem(INDEX_KEY) !== null) return;
    const raw = storage.getItem(LEGACY_STATE_KEY);
    if (raw === null) return;
    const state = parseState(JSON.parse(raw));
    if (!state) return;
    const room = storage.getItem(LEGACY_ROOM_KEY);
    const id = newCid();
    storage.setItem(committeeKey(id), JSON.stringify(state));
    writeIndex(
      [
        {
          id,
          name: state.name,
          topic: state.topic,
          roomId: room && ROOM_RE.test(room) ? room : null,
          updatedAt: Date.now(),
        },
      ],
      storage,
    );
    storage.removeItem(LEGACY_STATE_KEY);
    storage.removeItem(LEGACY_ROOM_KEY);
  } catch {
    // leave legacy data untouched
  }
}

/** All local committees, newest first. */
export function listCommittees(storage: Store = localStorage): CommitteeEntry[] {
  migrate(storage);
  return readIndex(storage).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getEntry(cid: string, storage: Store = localStorage): CommitteeEntry | null {
  return listCommittees(storage).find((e) => e.id === cid) ?? null;
}

export function loadCommittee(cid: string, storage: Store = localStorage): CommitteeState | null {
  migrate(storage);
  return loadState(cid, storage);
}

export function saveCommittee(cid: string, state: CommitteeState, storage: Store = localStorage): void {
  migrate(storage);
  saveState(cid, state, storage);
  const all = readIndex(storage);
  const i = all.findIndex((e) => e.id === cid);
  const next: CommitteeEntry = {
    id: cid,
    name: state.name,
    topic: state.topic,
    roomId: i >= 0 ? all[i].roomId : null,
    updatedAt: Date.now(),
  };
  if (i >= 0) all[i] = next;
  else all.push(next);
  writeIndex(all, storage);
}

/** Create a committee (empty unless `state` is given); returns its id. */
export function createEntry(
  opts: { roomId?: string | null; state?: CommitteeState } = {},
  storage: Store = localStorage,
): string {
  migrate(storage);
  const id = newCid();
  const state = opts.state ?? createCommittee();
  saveState(id, state, storage);
  writeIndex(
    [
      ...readIndex(storage),
      { id, name: state.name, topic: state.topic, roomId: opts.roomId ?? null, updatedAt: Date.now() },
    ],
    storage,
  );
  return id;
}

export function deleteCommittee(cid: string, storage: Store = localStorage): void {
  try {
    storage.removeItem(committeeKey(cid));
  } catch {
    // ignore
  }
  writeIndex(
    readIndex(storage).filter((e) => e.id !== cid),
    storage,
  );
  try {
    if (storage.getItem(ACTIVE_KEY) === cid) storage.removeItem(ACTIVE_KEY);
  } catch {
    // ignore
  }
}

export function setRoom(cid: string, roomId: string | null, storage: Store = localStorage): void {
  migrate(storage);
  const all = readIndex(storage);
  const i = all.findIndex((e) => e.id === cid);
  if (i < 0) return;
  all[i] = { ...all[i], roomId };
  writeIndex(all, storage);
}

export function findByRoom(roomId: string, storage: Store = localStorage): CommitteeEntry | null {
  return listCommittees(storage).find((e) => e.roomId === roomId) ?? null;
}

export function lastActive(storage: Store = localStorage): string | null {
  try {
    return storage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setLastActive(cid: string, storage: Store = localStorage): void {
  try {
    storage.setItem(ACTIVE_KEY, cid);
  } catch {
    // ignore
  }
}

/**
 * Decide which committee a tab shows from its URL query string:
 * ?room= (matching or new local committee), ?c=, last active, most recent, else a new one.
 */
export function resolveActive(search: string, storage: Store = localStorage): string {
  const params = new URLSearchParams(search);
  const room = params.get('room');
  if (room && ROOM_RE.test(room)) {
    return findByRoom(room, storage)?.id ?? createEntry({ roomId: room }, storage);
  }
  const list = listCommittees(storage);
  const c = params.get('c');
  if (c && CID_RE.test(c) && list.some((e) => e.id === c)) return c;
  const last = lastActive(storage);
  if (last && list.some((e) => e.id === last)) return last;
  if (list.length > 0) return list[0].id;
  return createEntry({}, storage);
}

/** Query string for a committee: always ?c=, plus &room= when shared. */
export function searchFor(cid: string, storage: Store = localStorage): string {
  const entry = getEntry(cid, storage);
  const p = new URLSearchParams();
  p.set('c', cid);
  if (entry?.roomId) p.set('room', entry.roomId);
  return `?${p.toString()}`;
}
