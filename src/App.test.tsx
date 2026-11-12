import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { createEntry, getEntry, listCommittees, loadCommittee, saveCommittee, setLastActive } from './state/library';
import { createCommittee } from './state/state';

const named = (name: string) => ({ ...createCommittee(), name });

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  window.location.hash = '';
});

describe('App', () => {
  it('shows the setup screen for a fresh browser and puts ?c= in the URL', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Set up your committee' })).toBeInTheDocument();
    const list = listCommittees();
    expect(list).toHaveLength(1);
    expect(window.location.search).toBe(`?c=${list[0].id}`);
    expect(localStorage.getItem('mun-chair:active')).toBe(list[0].id);
  });

  it('shows the projector view on #/projector', () => {
    window.location.hash = '#/projector';
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Projector view' })).toBeInTheDocument();
    expect(listCommittees()).toHaveLength(0);
  });

  it('opens the committee named by ?c=', () => {
    const a = createEntry({ state: named('Alpha') });
    createEntry({ state: named('Beta') });
    window.history.replaceState(null, '', `/?c=${a}`);
    render(<App />);
    expect(screen.getByLabelText('Committee name')).toHaveValue('Alpha');
  });

  it('opens the last active committee without a query', () => {
    createEntry({ state: named('Alpha') });
    const b = createEntry({ state: named('Beta') });
    setLastActive(b);
    render(<App />);
    expect(screen.getByLabelText('Committee name')).toHaveValue('Beta');
    expect(window.location.search).toBe(`?c=${b}`);
  });

  it('?room= opens the committee bound to the room and keeps room in the URL', () => {
    createEntry({ state: named('Alpha') });
    const b = createEntry({ roomId: 'room-b', state: named('Beta') });
    window.history.replaceState(null, '', '/?room=room-b');
    render(<App />);
    expect(screen.getByLabelText('Committee name')).toHaveValue('Beta');
    expect(window.location.search).toBe(`?c=${b}&room=room-b`);
  });

  it('an unknown ?room= creates a new committee and leaves the others alone', () => {
    const a = createEntry({ state: named('Alpha') });
    window.history.replaceState(null, '', '/?room=room-x');
    render(<App />);
    expect(screen.getByLabelText('Committee name')).toHaveValue('');
    expect(listCommittees()).toHaveLength(2);
    expect(loadCommittee(a)?.name).toBe('Alpha');
    const mine = listCommittees().find((e) => e.roomId === 'room-x');
    expect(mine).toBeDefined();
    expect(window.location.search).toBe(`?c=${mine!.id}&room=room-x`);
  });

  it('switches committees in place from the Committees dialog and updates the URL', async () => {
    const user = userEvent.setup();
    const a = createEntry({ state: { ...named('Alpha'), stage: 'running' } });
    const b = createEntry({ state: named('Beta') });
    saveCommittee(b, named('Beta'));
    window.history.replaceState(null, '', `/?c=${a}`);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: 'Committees…' }));
    await user.click(screen.getByRole('button', { name: 'Open Beta' }));
    expect(screen.getByLabelText('Committee name')).toHaveValue('Beta');
    expect(window.location.search).toBe(`?c=${b}`);
    expect(getEntry(a)?.name).toBe('Alpha');
  });
});
