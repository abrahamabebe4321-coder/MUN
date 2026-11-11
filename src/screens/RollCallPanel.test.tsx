import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommitteeProvider, useCommittee } from '../state/CommitteeContext';
import { createCommittee } from '../state/state';
import { RollCallPanel } from './RollCallPanel';

function initial() {
  const s = createCommittee();
  s.stage = 'running';
  s.delegates = [
    ['et', 'Ethiopia'],
    ['ke', 'Kenya'],
    ['us', 'United States'],
    ['gb', 'United Kingdom'],
  ].map(([id, name]) => ({ id, name, flag: id, attendance: 'absent' as const }));
  return s;
}

function Probe() {
  const { state } = useCommittee();
  return <div data-testid="probe">{state.delegates.map((d) => `${d.id}:${d.attendance}`).join(',')}</div>;
}

function setup() {
  render(
    <CommitteeProvider initial={initial()}>
      <RollCallPanel />
      <Probe />
    </CommitteeProvider>,
  );
  return userEvent.setup();
}

const probe = () => screen.getByTestId('probe').textContent;

beforeEach(() => localStorage.clear());

describe('RollCallPanel', () => {
  it('shows initial summary', () => {
    setup();
    const sum = screen.getByLabelText('Attendance summary');
    expect(within(sum).getByText('Present: 0 / 4')).toBeInTheDocument();
    expect(within(sum).getByText('Absent: 4')).toBeInTheDocument();
    expect(within(sum).getByText('No quorum')).toBeInTheDocument();
  });

  it('sets attendance via radio', async () => {
    const user = setup();
    const group = screen.getByRole('radiogroup', { name: 'Attendance for Kenya' });
    await user.click(within(group).getByRole('radio', { name: 'Present & voting' }));
    expect(probe()).toContain('ke:present_voting');
    expect(within(group).getByRole('radio', { name: 'Present & voting' })).toHaveAttribute('aria-checked', 'true');
    expect(within(group).getByRole('radio', { name: 'Absent' })).toHaveAttribute('aria-checked', 'false');
  });

  it('All present and Clear', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'All present' }));
    const sum = screen.getByLabelText('Attendance summary');
    expect(within(sum).getByText('Quorum met')).toBeInTheDocument();
    expect(within(sum).getByText('Simple majority: 3')).toBeInTheDocument();
    expect(within(sum).getByText('Two-thirds majority: 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(probe()).toBe('et:absent,ke:absent,us:absent,gb:absent');
    expect(within(sum).getByText('No quorum')).toBeInTheDocument();
  });

  it('steps through with buttons', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Call the roll one by one' }));
    expect(screen.getByText('1 of 4')).toBeInTheDocument();
    const stepper = screen.getByText('Call the roll').closest('.card') as HTMLElement;
    await user.click(within(stepper).getByRole('button', { name: /^Present\b(?! &)/ }));
    expect(probe()).toContain('et:present,');
    expect(screen.getByText('2 of 4')).toBeInTheDocument();
    expect(within(stepper).getByText('Kenya')).toBeInTheDocument();
  });

  it('keyboard shortcuts, completion and restart', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Call the roll one by one' }));
    await user.keyboard('v');
    expect(probe()).toContain('et:present_voting');
    await user.keyboard('a');
    expect(probe()).toContain('ke:absent');
    await user.keyboard('p');
    await user.keyboard('p');
    expect(screen.getByText('Roll call complete.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restart' }));
    expect(screen.getByText('1 of 4')).toBeInTheDocument();
  });

  it('shortcuts do nothing while collapsed', async () => {
    const user = setup();
    await user.keyboard('p');
    expect(probe()).toBe('et:absent,ke:absent,us:absent,gb:absent');
  });
});
