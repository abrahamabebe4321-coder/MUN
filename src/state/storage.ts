import type { CommitteeState } from './state';

/** Pre-library single-committee key; only read by the migration. */
export const LEGACY_STATE_KEY = 'mun-chair:committee:v1';
/** Pre-library global room key; only read by the migration. */
export const LEGACY_ROOM_KEY = 'mun-chair:room';
export const INDEX_KEY = 'mun-chair:committees:v1';
export const ACTIVE_KEY = 'mun-chair:active';

export function committeeKey(cid: string): string {
  return `mun-chair:committee:${cid}`;
}

export function saveState(
  cid: string,
  state: CommitteeState,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    storage.setItem(committeeKey(cid), JSON.stringify(state));
  } catch {
    // storage unavailable or full; ignore
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseState(value: unknown): CommitteeState | null {
  if (!isObject(value)) return null;
  const v = value;
  if (v.version !== 1) return null;
  if (typeof v.name !== 'string' || typeof v.topic !== 'string') return null;
  if (v.stage !== 'setup' && v.stage !== 'running' && v.stage !== 'ended') return null;
  if (typeof v.session !== 'number' || typeof v.nextId !== 'number') return null;
  for (const key of ['delegates', 'interactions', 'motions', 'votes', 'resolutions']) {
    if (!Array.isArray(v[key])) return null;
  }
  if (!isObject(v.scoring) || !isObject(v.debate)) return null;
  const debate = v.debate as Record<string, unknown>;
  const pinned = typeof debate.pinnedLastId === 'string' ? debate.pinnedLastId : null;
  const poiQueue = Array.isArray(debate.poiQueue)
    ? debate.poiQueue.filter((x): x is string => typeof x === 'string')
    : [];
  return { ...v, debate: { ...debate, pinnedLastId: pinned, poiQueue } } as unknown as CommitteeState;
}

export function loadState(
  cid: string,
  storage: Pick<Storage, 'getItem'> = localStorage,
): CommitteeState | null {
  try {
    const raw = storage.getItem(committeeKey(cid));
    if (raw === null) return null;
    return parseState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function exportJson(state: CommitteeState): string {
  return JSON.stringify(state, null, 2);
}

export function importJson(text: string): CommitteeState | null {
  try {
    return parseState(JSON.parse(text));
  } catch {
    return null;
  }
}
