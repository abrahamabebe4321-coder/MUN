import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommitteeProvider } from '../state/CommitteeContext';
import { createEntry, listCommittees, setRoom } from '../state/library';
import { createCommittee } from '../state/state';
import { CommitteesDialog } from './CommitteesDialog';

const switched = vi.fn();
const onClose = vi.fn();

function setup() {
  const a = createEntry({ state: { ...createCommittee(), name: 'GA', topic: 'Veto' } });
  const b = createEntry({ state: { ...createCommittee(), name: 'UNSC' } });
  const c = createEntry({ state: createCommittee() });
  setRoom(b, 'room-b');
  render(
    <CommitteeProvider cid={a} onSwitch={switched}>
      <CommitteesDialog onClose={onClose} />
    </CommitteeProvider>,
  );
  return { a, b, c, user: userEvent.setup() };
}

beforeEach(() => {
  localStorage.clear();
  switched.mockClear();
  onClose.mockClear();
});

describe('CommitteesDialog', () => {
  it('lists committees with names, topic, shared tag and the open one', () => {
    setup();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(screen.getByText('Untitled committee')).toBeInTheDocument();
    expect(screen.getByText('Veto')).toBeInTheDocument();
    expect(screen.getByText('Shared')).toBeInTheDocument();
    expect(screen.getByText('Open now')).toBeInTheDocument();
  });

  it('the open committee has no Open or Delete', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Open GA' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete GA' })).toBeNull();
  });

  it('Open switches to that committee', async () => {
    const { b, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Open UNSC' }));
    expect(switched).toHaveBeenCalledWith(b);
    expect(onClose).toHaveBeenCalled();
  });

  it('New committee creates an empty one and switches to it', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'New committee' }));
    expect(listCommittees()).toHaveLength(4);
    const ids = new Set(listCommittees().map((e) => e.id));
    expect(ids.has(switched.mock.calls[0][0] as string)).toBe(true);
  });

  it('Delete asks first, says the co-chair keeps their copy, then removes it', async () => {
    const { b, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Delete UNSC' }));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Delete UNSC from this laptop? This can't be undone.");
    expect(alert).toHaveTextContent('Your co-chair keeps their copy.');
    await user.click(within(alert).getByRole('button', { name: 'Cancel' }));
    expect(listCommittees().some((e) => e.id === b)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Delete UNSC' }));
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Delete' }));
    expect(listCommittees().some((e) => e.id === b)).toBe(false);
    expect(screen.queryByText('UNSC')).toBeNull();
  });
});
