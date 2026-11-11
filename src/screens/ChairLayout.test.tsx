import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
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

beforeEach(() => localStorage.clear());

describe('ChairLayout', () => {
  it('shows name, topic, session and attendance', () => {
    setup();
    expect(topbar().getByText('GA1')).toBeInTheDocument();
    expect(topbar().getByText('Veto reform')).toBeInTheDocument();
    expect(topbar().getByText('Session 1')).toBeInTheDocument();
    expect(topbar().getByText(/0\/3 present/)).toHaveTextContent('No quorum');
  });

  it('starts on Roll call when nobody is present, Debate otherwise', () => {
    setup();
    expect(tab('Roll call')).toHaveAttribute('aria-selected', 'true');
  });

  it('starts on Debate when someone is present', () => {
    setup(running(true));
    expect(tab('Debate')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Debate' })).toBeInTheDocument();
  });

  it('switches tabs', async () => {
    const user = setup();
    await user.click(tab('Leaderboard'));
    expect(tab('Leaderboard')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Roll call')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('region', { name: 'Leaderboard' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Debate',
      'Motions & voting',
      'Resolutions',
      'Leaderboard',
      'Roll call',
      'Settings',
    ]);
  });

  it('panels can switch tab through useNav (passing a caucus motion opens Debate)', async () => {
    const user = setup(running(true));
    await user.click(tab('Motions & voting'));
    await user.click(screen.getByRole('combobox', { name: 'Proposed by' }));
    await user.click(screen.getByRole('option', { name: /Ethiopia/ }));
    await user.type(screen.getByLabelText('Topic'), 'Water');
    await user.click(screen.getByRole('button', { name: 'Add to the floor' }));
    await user.click(screen.getByRole('button', { name: 'Pass without vote' }));
    expect(tab('Debate')).toHaveAttribute('aria-selected', 'true');
  });

  it('undo/redo via buttons after an attendance change', async () => {
    const user = setup();
    const undoBtn = screen.getByRole('button', { name: 'Undo' });
    expect(undoBtn).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'All present' }));
    expect(topbar().getByText(/3\/3 present/)).toBeInTheDocument();
    expect(undoBtn).toBeEnabled();
    await user.click(undoBtn);
    expect(topbar().getByText(/0\/3 present/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
  });

  it('Ctrl+Z triggers undo', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'All present' }));
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(topbar().getByText(/0\/3 present/)).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(topbar().getByText(/3\/3 present/)).toBeInTheDocument();
  });

  it('next session flow', async () => {
    const user = setup(running(true));
    await user.click(screen.getByRole('button', { name: 'Next session' }));
    expect(screen.getByText(/Start session 2\?/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start session 2' }));
    expect(topbar().getByText('Session 2')).toBeInTheDocument();
    expect(tab('Roll call')).toHaveAttribute('aria-selected', 'true');
  });

  it('end conference flow and reopen', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'End conference' }));
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
    open.mockRestore();
  });
});
