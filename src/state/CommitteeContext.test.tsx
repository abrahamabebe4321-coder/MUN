import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitteeProvider, useCommittee, useStoredCommittee } from './CommitteeContext';
import { createCommittee } from './state';
import { loadState, saveState, STORAGE_KEY } from './storage';

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
    render(<CommitteeProvider><Probe /></CommitteeProvider>);
    expect(screen.getByTestId('can')).toHaveTextContent('false/false');
    await user.click(screen.getByText('set'));
    expect(screen.getByTestId('name')).toHaveTextContent('UNSC');
    expect(loadState()?.name).toBe('UNSC');
    await user.click(screen.getByText('undo'));
    expect(screen.getByTestId('name')).toHaveTextContent('');
    expect(screen.getByTestId('can')).toHaveTextContent('false/true');
    expect(loadState()?.name).toBe('');
    await user.click(screen.getByText('redo'));
    expect(screen.getByTestId('name')).toHaveTextContent('UNSC');
  });

  it('uses the initial prop and falls back to stored state', () => {
    saveState({ ...createCommittee(), name: 'Stored' });
    const { unmount } = render(<CommitteeProvider><Probe /></CommitteeProvider>);
    expect(screen.getByTestId('name')).toHaveTextContent('Stored');
    unmount();
    render(<CommitteeProvider initial={{ ...createCommittee(), name: 'Init' }}><Probe /></CommitteeProvider>);
    expect(screen.getByTestId('name')).toHaveTextContent('Init');
  });

  it('useCommittee throws outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useCommittee())).toThrow();
    spy.mockRestore();
  });
});

describe('useStoredCommittee', () => {
  it('re-reads on storage events for the key', () => {
    const { result } = renderHook(() => useStoredCommittee());
    expect(result.current).toBeNull();
    act(() => {
      saveState({ ...createCommittee(), name: 'Live' });
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    });
    expect(result.current?.name).toBe('Live');
    act(() => {
      saveState({ ...createCommittee(), name: 'Other' });
      window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    });
    expect(result.current?.name).toBe('Live');
  });
});
