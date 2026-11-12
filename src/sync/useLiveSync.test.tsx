import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeMap, FakeObject } from './fakeLive';

const h = vi.hoisted(() => ({
  root: null as unknown,
  deepCb: null as null | (() => void),
  leave: null as unknown,
  batch: null as unknown,
}));

vi.mock('@liveblocks/client', async () => {
  const fake = await import('./fakeLive');
  return {
    LiveObject: fake.FakeObject,
    LiveMap: fake.FakeMap,
    createClient: () => ({
      enterRoom: () => {
        const leave = vi.fn();
        const batch = vi.fn((fn: () => void) => fn());
        h.leave = leave;
        h.batch = batch;
        return {
          leave,
          room: {
            getStatus: () => 'connected',
            getOthers: () => [],
            subscribe: (target: unknown, cb?: () => void) => {
              if (typeof target !== 'string') h.deepCb = cb ?? null;
              return () => {};
            },
            batch,
            getStorage: () => Promise.resolve({ root: h.root }),
          },
        };
      },
    }),
  };
});

import { CommitteeProvider, useCommittee } from '../state/CommitteeContext';
import { createEntry, getEntry } from '../state/library';
import { createCommittee } from '../state/state';
import { initRoot, readStorage } from './storageModel';
import type { RootLike } from './storageModel';
import { fakeFactory } from './fakeLive';

function Probe() {
  const { state, dispatch, sync } = useCommittee();
  return (
    <div>
      <span data-testid="name">{state.name}</span>
      <span data-testid="status">{sync.status}</span>
      <span data-testid="tag">{state.clientTag ?? ''}</span>
      <button onClick={() => dispatch({ type: 'committee/update', name: 'Local edit' })}>edit</button>
      <button onClick={() => sync.startSharing()}>share</button>
      <button onClick={() => sync.stopSharing()}>stop</button>
    </div>
  );
}

const withDelegate = (name: string) => ({
  ...createCommittee(),
  name,
  stage: 'running' as const,
  delegates: [{ id: 'ke', name: 'Kenya', flag: 'ke', attendance: 'present' as const }],
});

function room(state = createCommittee(), roomId: string | null = 'test-room') {
  return createEntry({ roomId, state });
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  h.root = new FakeObject();
  h.deepCb = null;
});

describe('live sync', () => {
  it('is off without a room', () => {
    window.history.replaceState(null, '', '/?room=test-room');
    render(<CommitteeProvider cid={room(createCommittee(), null)}><Probe /></CommitteeProvider>);
    expect(screen.getByTestId('status')).toHaveTextContent('off');
  });

  it('initialises an empty room from the local committee and tags ids', async () => {
    render(<CommitteeProvider cid={room()} initial={withDelegate('Mine')}><Probe /></CommitteeProvider>);
    await waitFor(() => expect((h.root as FakeObject).get('meta')).toBeDefined());
    expect(readStorage(h.root as RootLike).name).toBe('Mine');
    expect(screen.getByTestId('tag').textContent).toHaveLength(6);
    expect(localStorage.getItem('mun-chair:room')).toBeNull();
  });

  it('pushes local actions with applyDiff and adopts remote updates', async () => {
    const user = userEvent.setup();
    render(<CommitteeProvider cid={room()} initial={withDelegate('Mine')}><Probe /></CommitteeProvider>);
    await waitFor(() => expect(h.deepCb).not.toBeNull());
    await user.click(screen.getByText('edit'));
    await waitFor(() =>
      expect(((h.root as FakeObject).get('meta') as FakeObject).get('name')).toBe('Local edit'),
    );
    ((h.root as FakeObject).get('meta') as FakeObject).set('name', 'From co-chair');
    act(() => h.deepCb!());
    expect(screen.getByTestId('name')).toHaveTextContent('From co-chair');
  });

  it('joins silently when the local committee is empty', async () => {
    initRoot(h.root as RootLike, withDelegate('Shared'), fakeFactory);
    render(<CommitteeProvider cid={room()}><Probe /></CommitteeProvider>);
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Shared'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('follows the room without asking when a non-empty committee is bound to it', async () => {
    initRoot(h.root as RootLike, withDelegate('Shared'), fakeFactory);
    render(<CommitteeProvider cid={room()} initial={withDelegate('Mine')}><Probe /></CommitteeProvider>);
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Shared'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('takes the room only from the committee, not from the URL', () => {
    window.history.replaceState(null, '', '/?room=test-room');
    render(<CommitteeProvider cid={room(createCommittee(), null)}><Probe /></CommitteeProvider>);
    expect(screen.getByTestId('status')).toHaveTextContent('off');
  });

  it('start and stop sharing bind the room to the committee and the URL', async () => {
    const user = userEvent.setup();
    const cid = room(createCommittee(), null);
    window.history.replaceState(null, '', `/?c=${cid}`);
    render(<CommitteeProvider cid={cid}><Probe /></CommitteeProvider>);
    await user.click(screen.getByText('share'));
    const r = getEntry(cid)?.roomId;
    expect(r).toMatch(/^mun-/);
    expect(window.location.search).toBe(`?c=${cid}&room=${r}`);
    await user.click(screen.getByText('stop'));
    expect(getEntry(cid)?.roomId).toBeNull();
    expect(window.location.search).toBe(`?c=${cid}`);
  });

  it('keeps two committees in separate rooms', () => {
    const a = room(withDelegate('A'), 'room-a');
    const b = room(withDelegate('B'), 'room-b');
    expect(getEntry(a)?.roomId).toBe('room-a');
    expect(getEntry(b)?.roomId).toBe('room-b');
    expect(FakeMap).toBeDefined();
  });
});
