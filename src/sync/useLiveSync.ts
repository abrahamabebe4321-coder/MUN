import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient, LiveMap, LiveObject } from '@liveblocks/client';
import type { Client } from '@liveblocks/client';
import type { CommitteeState } from '../state/state';
import { LIVEBLOCKS_PUBLIC_KEY } from './config';
import {
  applyDiff,
  initRoot,
  isStorageEmpty,
  mergeRemote,
  readStorage,
  sameCommittee,
} from './storageModel';
import type { LiveFactory, LiveMapLike, LiveObjectLike, RootLike, SharedCommittee } from './storageModel';

export type SyncStatus = 'off' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export const ROOM_KEY = 'mun-chair:room';

export interface SyncApi {
  status: SyncStatus;
  /** Number of other people in the room. */
  others: number;
  roomId: string | null;
  shareUrl: string | null;
  /** Set while the join-confirm modal should be shown. */
  pendingJoin: { name: string } | null;
  confirmJoin: () => void;
  cancelJoin: () => void;
  /** Create a new room from this committee and join it. */
  startSharing: () => string;
  /** Leave the room and keep the local copy. */
  stopSharing: () => void;
}

const liveFactory: LiveFactory = {
  object: (init) => new LiveObject(init as never) as unknown as LiveObjectLike,
  map: (entries) => new LiveMap(entries as never) as unknown as LiveMapLike,
};

let client: Client | null = null;
function getClient(): Client {
  client ??= createClient({ publicApiKey: LIVEBLOCKS_PUBLIC_KEY });
  return client;
}

const ROOM_RE = /^[A-Za-z0-9_-]{1,64}$/;

function safe(fn: () => void) {
  try {
    fn();
  } catch {
    // storage unavailable
  }
}

function setUrlRoom(roomId: string | null) {
  safe(() => {
    const url = new URL(window.location.href);
    if (roomId) url.searchParams.set('room', roomId);
    else url.searchParams.delete('room');
    window.history.replaceState(window.history.state, '', url.toString());
  });
}

function setStoredRoom(roomId: string | null) {
  safe(() => {
    if (roomId) localStorage.setItem(ROOM_KEY, roomId);
    else localStorage.removeItem(ROOM_KEY);
  });
}

/** Room from `?room=` (wins) or from the last joined room. */
export function initialRoomId(): string | null {
  let fromUrl: string | null = null;
  safe(() => {
    fromUrl = new URLSearchParams(window.location.search).get('room');
  });
  if (fromUrl && ROOM_RE.test(fromUrl)) return fromUrl;
  let stored: string | null = null;
  safe(() => {
    stored = localStorage.getItem(ROOM_KEY);
  });
  return stored && ROOM_RE.test(stored) ? stored : null;
}

export function randomBase36(n: number): string {
  let out = '';
  while (out.length < n) out += Math.floor(Math.random() * 36 ** 6).toString(36);
  return out.slice(0, n);
}

function isEmptyCommittee(s: SharedCommittee): boolean {
  return s.stage === 'setup' && s.delegates.length === 0;
}

function mapStatus(s: string): SyncStatus {
  if (s === 'connected') return 'connected';
  if (s === 'reconnecting') return 'reconnecting';
  if (s === 'disconnected') return 'error';
  return 'connecting';
}

export function useLiveSync(
  present: CommitteeState,
  dispatchRemote: (state: CommitteeState) => void,
  dispatchTag: (tag: string) => void,
): SyncApi {
  const [roomId, setRoomId] = useState<string | null>(() => initialRoomId());
  const [status, setStatus] = useState<SyncStatus>('off');
  const [others, setOthers] = useState(0);
  const [pendingJoin, setPendingJoin] = useState<{ name: string } | null>(null);

  const presentRef = useRef(present);
  presentRef.current = present;
  const dispatchRef = useRef(dispatchRemote);
  dispatchRef.current = dispatchRemote;
  const rootRef = useRef<RootLike | null>(null);
  const roomRef = useRef<{ batch: (fn: () => void) => void } | null>(null);
  const lastSynced = useRef<CommitteeState | null>(null);
  const decision = useRef<{ confirm: () => void; cancel: () => void } | null>(null);

  const stopSharing = useCallback(() => {
    setUrlRoom(null);
    setStoredRoom(null);
    setRoomId(null);
  }, []);

  const startSharing = useCallback(() => {
    const id = `mun-${randomBase36(10)}`;
    setUrlRoom(id);
    setStoredRoom(id);
    setRoomId(id);
    return id;
  }, []);

  // Every laptop in a room mints ids with its own tag so they never collide.
  useEffect(() => {
    if (roomId && !present.clientTag) dispatchTag(randomBase36(6));
  }, [roomId, present.clientTag, dispatchTag]);

  useEffect(() => {
    if (!roomId) {
      setStatus('off');
      setOthers(0);
      return;
    }
    setUrlRoom(roomId);
    setStoredRoom(roomId);
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    setStatus('connecting');

    const { room, leave } = getClient().enterRoom(roomId, { initialPresence: {} });
    roomRef.current = room;
    setStatus(mapStatus(room.getStatus()));
    unsubs.push(room.subscribe('status', (s) => setStatus(mapStatus(s))));
    setOthers(room.getOthers().length);
    unsubs.push(room.subscribe('others', (list) => setOthers(list.length)));

    const flush = () => {
      const root = rootRef.current;
      const prev = lastSynced.current;
      const cur = presentRef.current;
      if (!root || !prev || prev === cur) return;
      lastSynced.current = cur; // before writing: the write notifies our own subscription
      room.batch(() => applyDiff(root, prev, cur));
    };
    flushRef.current = flush;

    const adopt = (remote: SharedCommittee) => {
      const cur = presentRef.current;
      const merged = mergeRemote(remote, cur);
      if (sameCommittee(merged, cur)) {
        lastSynced.current = cur;
        return;
      }
      const adopted: CommitteeState = { ...merged, clientTag: cur.clientTag };
      lastSynced.current = adopted;
      presentRef.current = adopted;
      dispatchRef.current(adopted);
    };

    const go = (root: RootLike) => {
      rootRef.current = root;
      lastSynced.current ??= presentRef.current;
      unsubs.push(
        (
          room as unknown as {
            subscribe(target: unknown, cb: () => void, opts: { isDeep: boolean }): () => void;
          }
        ).subscribe(
          root,
          () => {
            flush(); // push our own unsynced change first so it is not overwritten
            adopt(readStorage(root));
          },
          { isDeep: true },
        ),
      );
    };

    room
      .getStorage()
      .then(({ root }) => {
        if (cancelled) return;
        const r = root as unknown as RootLike;
        if (isStorageEmpty(r)) {
          const cur = presentRef.current;
          room.batch(() => initRoot(r, cur, liveFactory));
          lastSynced.current = cur;
          go(r);
          return;
        }
        const remote = readStorage(r);
        const local = presentRef.current;
        if (isEmptyCommittee(local) || sameCommittee(mergeRemote(remote, local), local)) {
          adopt(remote);
          go(r);
          return;
        }
        decision.current = {
          confirm: () => {
            setPendingJoin(null);
            decision.current = null;
            adopt(readStorage(r));
            go(r);
          },
          cancel: () => {
            setPendingJoin(null);
            decision.current = null;
            stopSharing();
          },
        };
        setPendingJoin({ name: remote.name || 'Untitled committee' });
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      for (const u of unsubs) u();
      rootRef.current = null;
      roomRef.current = null;
      lastSynced.current = null;
      flushRef.current = null;
      decision.current = null;
      setPendingJoin(null);
      leave();
    };
  }, [roomId, stopSharing]);

  const flushRef = useRef<(() => void) | null>(null);
  // Local -> remote: push whatever changed since the last sync.
  useEffect(() => {
    flushRef.current?.();
  }, [present]);

  const confirmJoin = useCallback(() => decision.current?.confirm(), []);
  const cancelJoin = useCallback(() => decision.current?.cancel(), []);

  const shareUrl = roomId
    ? (() => {
        const url = new URL(window.location.href);
        url.hash = '';
        url.search = '';
        url.searchParams.set('room', roomId);
        return url.toString();
      })()
    : null;

  return { status, others, roomId, shareUrl, pendingJoin, confirmJoin, cancelJoin, startSharing, stopSharing };
}
