import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitteeProvider, useCommittee, useStoredCommittee } from './CommitteeContext';
import { createCommittee } from './state';
import { committeeKey, loadState, saveState } from './storage';
import { createEntry } from './library';

function Probe() {
  const { state, dispatch, undo, redo, canUndo, canRedo } = useCommittee();
  return (
    <div>
      <span data-testid="name">{state.name}</span>
      <span data-testid="can">{`${canUndo}/${canRedo}`}</span>
      <button onClick={() => dispatch({ type: 'committee/update', name: 'UNSC' })}>set</button>
      <button onClick={undo}>undo</button>
      <button onClick={redo}>redo</button>
    </div>
  );
}

beforeEach(() => localStorage.clear());

describe('CommitteeProvider', () => {
  it('dispatches, undoes, redoes and persists', async () => {
    const user = userEvent.setup();
    const cid = createEntry();
    render(<CommitteeProvider cid={cid}><Probe /></CommitteeProvider>);
    expect(screen.getByTestId('can')).toHaveTextContent('false/false');
    await user.click(screen.getByText('set'));
    expect(screen.getByTestId('name')).toHaveTextContent('UNSC');
    expect(loadState(cid)?.name).toBe('UNSC');
    await user.click(screen.getByText('undo'));
    expect(screen.getByTestId('name')).toHaveTextContent('');
    expect(screen.getByTestId('can')).toHaveTextContent('false/true');
    expect(loadState(cid)?.name).toBe('');
    await user.click(screen.getByText('redo'));
    expect(screen.getByTestId('name')).toHaveTextContent('UNSC');
  });

  it('uses the initial prop and falls back to the stored committee', () => {
    const cid = createEntry({ state: { ...createCommittee(), name: 'Stored' } });
    const { unmount } = render(<CommitteeProvider cid={cid}><Probe /></CommitteeProvider>);
    expect(screen.getByTestId('name')).toHaveTextContent('Stored');
    unmount();
    render(<CommitteeProvider cid={cid} initial={{ ...createCommittee(), name: 'Init' }}><Probe /></CommitteeProvider>);
    expect(screen.getByTestId('name')).toHaveTextContent('Init');
  });

  it('saves only to its own committee key', async () => {
    const user = userEvent.setup();
    const a = createEntry({ state: { ...createCommittee(), name: 'A' } });
    const b = createEntry({ state: { ...createCommittee(), name: 'B' } });
    render(<CommitteeProvider cid={a}><Probe /></CommitteeProvider>);
    await user.click(screen.getByText('set'));
    expect(loadState(a)?.name).toBe('UNSC');
    expect(loadState(b)?.name).toBe('B');
  });

  it('useCommittee throws outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useCommittee())).toThrow();
    spy.mockRestore();
  });
});

describe('useStoredCommittee', () => {
  it('re-reads on storage events for its committee key only', () => {
    const { result } = renderHook(() => useStoredCommittee('c-test0001'));
    expect(result.current).toBeNull();
    act(() => {
      saveState('c-test0001', { ...createCommittee(), name: 'Live' });
      window.dispatchEvent(new StorageEvent('storage', { key: committeeKey('c-test0001') }));
    });
    expect(result.current?.name).toBe('Live');
    act(() => {
      saveState('c-test0001', { ...createCommittee(), name: 'Other' });
      window.dispatchEvent(new StorageEvent('storage', { key: committeeKey('c-other') }));
    });
    expect(result.current?.name).toBe('Live');
  });
});
