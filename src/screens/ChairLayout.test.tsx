import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommitteeProvider } from '../state/CommitteeContext';
import { createCommittee } from '../state/state';
import type { CommitteeState } from '../state/state';
import { ChairApp } from '../App';

function running(present = false): CommitteeState {
  const s = createCommittee();
  s.stage = 'running';
  s.name = 'GA1';
  s.topic = 'Veto reform';
  s.delegates = [
    ['et', 'Ethiopia'],
    ['ke', 'Kenya'],
    ['us', 'United States'],
  ].map(([id, name], i) => ({
    id,
    name,
    flag: id,
    attendance: present && i === 0 ? ('present' as const) : ('absent' as const),
  }));
  return s;
}

function setup(s = running()) {
  render(
    <CommitteeProvider initial={s}>
      <ChairApp />
    </CommitteeProvider>,
  );
  return userEvent.setup();
}

const tab = (name: string) => screen.getByRole('tab', { name });
const topbar = () => within(document.querySelector('.chair-topbar') as HTMLElement);
const attendance = (present: number, total: number) =>
  screen.getByRole('button', { name: new RegExp(`^Attendance: ${present} of ${total} present`) });
const noTabSelected = () =>
  screen.getAllByRole('tab').forEach((t) => expect(t).toHaveAttribute('aria-selected', 'false'));
async function more(user: ReturnType<typeof userEvent.setup>, item: string | RegExp) {
  await user.click(screen.getByRole('button', { name: 'More' }));
  await user.click(screen.getByRole('menuitem', { name: item }));
}

beforeEach(() => localStorage.clear());

describe('ChairLayout', () => {
  it('shows name, topic, session and attendance', () => {
    setup();
    expect(topbar().getByText('GA1')).toBeInTheDocument();
    expect(topbar().getByText('Veto reform')).toBeInTheDocument();
    expect(topbar().getByText('Session 1')).toBeInTheDocument();
    expect(attendance(0, 3)).toHaveTextContent('0 of 3 present (no quorum)');
  });

  it('starts on the Roll call page (no tab selected) when nobody is present', () => {
    setup();
    noTabSelected();
    expect(screen.getByRole('region', { name: 'Roll call' })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'Roll call' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to debate' })).toBeInTheDocument();
  });

  it('starts on Debate when someone is present', () => {
    setup(running(true));
    expect(tab('Debate')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Debate' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to debate' })).not.toBeInTheDocument();
    expect(attendance(1, 3)).toHaveTextContent(/^1 of 3 present$/);
  });

  it('shows four tabs and switches between them', async () => {
    const user = setup();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Debate',
      'Motions',
      'Resolutions',
      'Scores',
    ]);
    await user.click(tab('Scores'));
    expect(tab('Scores')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Debate')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('region', { name: 'Leaderboard' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to debate' })).not.toBeInTheDocument();
  });

  it('attendance button, More menu and Back to debate navigate between pages', async () => {
    const user = setup(running(true));
    await user.click(attendance(1, 3));
    expect(screen.getByRole('region', { name: 'Roll call' })).toBeInTheDocument();
    noTabSelected();
    await user.click(screen.getByRole('button', { name: 'Back to debate' }));
    expect(tab('Debate')).toHaveAttribute('aria-selected', 'true');

    await more(user, 'Settings');
    expect(screen.getByRole('region', { name: 'Settings' })).toBeInTheDocument();
    noTabSelected();
    await user.click(screen.getByRole('button', { name: 'Back to debate' }));
    expect(screen.getByRole('region', { name: 'Debate' })).toBeInTheDocument();

    await more(user, 'Roll call');
    expect(screen.getByRole('region', { name: 'Roll call' })).toBeInTheDocument();
  });

  it('panels can switch tab through useNav (passing a caucus motion opens Debate)', async () => {
    const user = setup(running(true));
    await user.click(tab('Motions'));
    await user.click(screen.getByRole('combobox', { name: 'Proposed by' }));
    await user.click(screen.getByRole('option', { name: /Ethiopia/ }));
    await user.type(screen.getByLabelText('Topic'), 'Water');
    await user.click(screen.getByRole('button', { name: 'Add to the floor' }));
    await user.click(screen.getByRole('button', { name: 'Pass without vote' }));
    expect(tab('Debate')).toHaveAttribute('aria-selected', 'true');
  });

  it('undo/redo after an attendance change', async () => {
    const user = setup();
    const undoBtn = screen.getByRole('button', { name: 'Undo' });
    expect(undoBtn).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'All present' }));
    expect(attendance(3, 3)).toBeInTheDocument();
    expect(undoBtn).toBeEnabled();
    await user.click(undoBtn);
    expect(attendance(0, 3)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menuitem', { name: /^Redo/ })).toBeEnabled();
    await user.click(screen.getByRole('menuitem', { name: /^Redo/ }));
    expect(attendance(3, 3)).toBeInTheDocument();
  });

  it('Ctrl+Z triggers undo and Ctrl+Shift+Z redo', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'All present' }));
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(attendance(0, 3)).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(attendance(3, 3)).toBeInTheDocument();
  });

  it('next session flow', async () => {
    const user = setup(running(true));
    await more(user, 'Next session');
    expect(screen.getByText(/Start session 2\?/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start session 2' }));
    expect(topbar().getByText('Session 2')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Roll call' })).toBeInTheDocument();
    noTabSelected();
  });

  it('end conference flow and reopen', async () => {
    const user = setup();
    await more(user, 'End conference');
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'End conference' }));
    expect(screen.getByRole('heading', { name: 'Conference summary' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reopen committee' }));
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('Projector opens a window', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Projector' }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(String(open.mock.calls[0][0])).toMatch(/#\/projector$/);
    expect(open.mock.calls[0][1]).toBe('mun-projector');
    open.mockRestore();
  });

  it('Projector moves the window to the second display', async () => {
    const win = { closed: false, moveTo: vi.fn(), resizeTo: vi.fn() };
    const open = vi.spyOn(window, 'open').mockImplementation(() => win as unknown as Window);
    const a = { availLeft: 0, availTop: 0, availWidth: 1440, availHeight: 900, isPrimary: true, label: 'a' };
    const b = { availLeft: 1440, availTop: 20, availWidth: 1920, availHeight: 1060, isPrimary: false, label: 'b' };
    (window as any).getScreenDetails = async () => ({ screens: [a, b], currentScreen: a }); // eslint-disable-line @typescript-eslint/no-explicit-any
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Projector' }));
    expect(open).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(win.moveTo).toHaveBeenCalledWith(1440, 20));
    expect(win.resizeTo).toHaveBeenCalledWith(1920, 1060);
    delete (window as any).getScreenDetails; // eslint-disable-line @typescript-eslint/no-explicit-any
    open.mockRestore();
  });
});
