import { createCommittee, idleDebate } from '../state/state';
import type { CommitteeState } from '../state/state';
import { parseState } from '../state/storage';

/**
 * Mapping between CommitteeState and the shared (Liveblocks) storage shape:
 *
 *   root { meta, delegates, interactions, motions, votes, resolutions, debate }
 *
 * Each record lives under its own key in a map and each meta/debate field is its own
 * key, so edits to different things merge instead of overwriting each other.
 * Only the small surface below is used from Liveblocks, so tests can use an in-memory fake.
 */

export interface LiveObjectLike {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}
export interface LiveMapLike {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): unknown;
  entries(): Iterable<[string, unknown]>;
}
export interface RootLike {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}
export interface LiveFactory {
  object(init: Record<string, unknown>): LiveObjectLike;
  map(entries: [string, unknown][]): LiveMapLike;
}

export type SharedCommittee = Omit<CommitteeState, 'clientTag'>;

export const COLLECTIONS = ['delegates', 'interactions', 'motions', 'votes', 'resolutions'] as const;
type CollectionKey = (typeof COLLECTIONS)[number];
const META_KEYS = ['name', 'topic', 'stage', 'session', 'nextId', 'scoring'] as const;
const DEBATE_KEYS = Object.keys(idleDebate());

type Rec = { id: string; [k: string]: unknown };

/** Strip undefined (not storable) by a JSON round trip. */
function clean<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function idNum(id: string): number {
  const m = /\d+/.exec(id);
  return m ? Number(m[0]) : 0;
}
const byId = (a: Rec, b: Rec) => idNum(a.id) - idNum(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const SORTERS: Record<CollectionKey, (a: Rec, b: Rec) => number> = {
  delegates: (a, b) => String(a.name).localeCompare(String(b.name)) || byId(a, b),
  interactions: (a, b) => Number(a.timestamp) - Number(b.timestamp) || byId(a, b),
  motions: (a, b) => Number(a.raisedOrder) - Number(b.raisedOrder) || byId(a, b),
  votes: (a, b) => Number(a.timestamp) - Number(b.timestamp) || byId(a, b),
  resolutions: (a, b) => Number(a._o) - Number(b._o) || byId(a, b),
};

function metaOf(state: SharedCommittee): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of META_KEYS) out[k] = clean(state[k]);
  return out;
}

function debateOf(state: SharedCommittee): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of DEBATE_KEYS) out[k] = clean((state.debate as unknown as Record<string, unknown>)[k]);
  return out;
}

function recordOf(key: CollectionKey, item: { id: string }, order: number): unknown {
  const v = clean(item) as Record<string, unknown>;
  return key === 'resolutions' ? { ...v, _o: order } : v;
}

/** Plain-object form of the whole committee, ready to be wrapped in Live structures. */
export function toStorageInit(state: SharedCommittee): {
  meta: Record<string, unknown>;
  debate: Record<string, unknown>;
} & Record<CollectionKey, Record<string, unknown>> {
  const collections = {} as Record<CollectionKey, Record<string, unknown>>;
  for (const key of COLLECTIONS) {
    const rec: Record<string, unknown> = {};
    (state[key] as { id: string }[]).forEach((item, i) => {
      rec[item.id] = recordOf(key, item, i);
    });
    collections[key] = rec;
  }
  return { meta: metaOf(state), debate: debateOf(state), ...collections };
}

/** True when the shared root has no committee in it yet. */
export function isStorageEmpty(root: RootLike): boolean {
  return root.get('meta') === undefined;
}

/** Fill an empty root from a committee. */
export function initRoot(root: RootLike, state: SharedCommittee, f: LiveFactory): void {
  const init = toStorageInit(state);
  root.set('meta', f.object(init.meta));
  root.set('debate', f.object(init.debate));
  for (const key of COLLECTIONS) root.set(key, f.map(Object.entries(init[key])));
}

/** Rebuild a committee from shared storage. Missing pieces fall back to defaults. */
export function readStorage(root: RootLike): SharedCommittee {
  const base = createCommittee();
  const meta = root.get('meta') as LiveObjectLike | undefined;
  const debate = root.get('debate') as LiveObjectLike | undefined;
  const out: Record<string, unknown> = { ...base };
  if (meta) {
    for (const k of META_KEYS) {
      const v = meta.get(k);
      if (v !== undefined) out[k] = v;
    }
  }
  const d: Record<string, unknown> = { ...(base.debate as unknown as Record<string, unknown>) };
  if (debate) {
    for (const k of DEBATE_KEYS) {
      const v = debate.get(k);
      if (v !== undefined) d[k] = v;
    }
  }
  out.debate = d;
  for (const key of COLLECTIONS) {
    const map = root.get(key) as LiveMapLike | undefined;
    const items: Rec[] = [];
    if (map) {
      for (const [id, v] of map.entries()) {
        if (isObject(v)) items.push({ ...v, id } as Rec);
      }
    }
    items.sort(SORTERS[key]);
    out[key] = key === 'resolutions' ? items.map(({ _o: _drop, ...r }) => r) : items;
  }
  return (parseState(out) ?? base) as SharedCommittee;
}

/** Sort-insensitive key for "is this the same committee" checks. */
export function canonicalJson(state: SharedCommittee): string {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(state).sort()) {
    if (k === 'clientTag') continue;
    const v = (state as unknown as Record<string, unknown>)[k];
    out[k] = (COLLECTIONS as readonly string[]).includes(k)
      ? [...(v as Rec[])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      : v;
  }
  return JSON.stringify(out, (_k, v: unknown) =>
    isObject(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v,
  );
}

export function sameCommittee(a: SharedCommittee, b: SharedCommittee): boolean {
  return a === b || canonicalJson(a) === canonicalJson(b);
}

/** Adopt a remote committee but never let nextId go backwards. */
export function mergeRemote(remote: SharedCommittee, local: SharedCommittee): SharedCommittee {
  return remote.nextId >= local.nextId ? remote : { ...remote, nextId: local.nextId };
}

function same(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** Write only what changed between two committees. Call inside one room.batch. */
export function applyDiff(root: RootLike, prev: SharedCommittee, next: SharedCommittee): void {
  if (prev === next) return;

  const meta = root.get('meta') as LiveObjectLike | undefined;
  if (meta) {
    for (const k of META_KEYS) {
      if (prev[k] === next[k]) continue;
      if (k === 'nextId') {
        const remote = meta.get('nextId');
        if (typeof remote === 'number' && remote >= next.nextId) continue;
      } else if (same(prev[k], next[k])) continue;
      meta.set(k, clean(next[k]));
    }
  }

  if (prev.debate !== next.debate) {
    const debate = root.get('debate') as LiveObjectLike | undefined;
    if (debate) {
      const p = prev.debate as unknown as Record<string, unknown>;
      const n = next.debate as unknown as Record<string, unknown>;
      for (const k of DEBATE_KEYS) {
        if (p[k] !== n[k] && !same(p[k], n[k])) debate.set(k, clean(n[k] ?? null));
      }
    }
  }

  for (const key of COLLECTIONS) {
    const a = prev[key] as { id: string }[];
    const b = next[key] as { id: string }[];
    if (a === b) continue;
    const map = root.get(key) as LiveMapLike | undefined;
    if (!map) continue;
    const before = new Map(a.map((x) => [x.id, x]));
    const seen = new Set<string>();
    for (const item of b) {
      seen.add(item.id);
      const old = before.get(item.id);
      if (old === item || (old && same(old, item))) continue;
      let order = Date.now();
      if (key === 'resolutions') {
        const existing = map.get(item.id);
        if (isObject(existing) && typeof existing._o === 'number') order = existing._o;
      }
      map.set(item.id, recordOf(key, item, order));
    }
    for (const id of before.keys()) if (!seen.has(id)) map.delete(id);
  }
}
