import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommitteeProvider, useCommittee } from '../../state/CommitteeContext';
import { createCommittee } from '../../state/state';
import type { CommitteeState } from '../../state/state';
import { VoteModal } from './VoteModal';
import type { VoteModalProps } from './VoteModal';

function initial(): CommitteeState {
  const s = createCommittee();
  s.stage = 'running';
  s.delegates = [
    ['et', 'Ethiopia', 'present'],
    ['ke', 'Kenya', 'present_voting'],
    ['us', 'United States', 'present'],
    ['gb', 'United Kingdom', 'present'],
    ['fr', 'France', 'absent'],
  ].map(([id, name, attendance]) => ({ id, name, flag: id, attendance: attendance as 'present' }));
  return s;
}

let latest: ReturnType<typeof useCommittee>;
function Probe() {
  latest = useCommittee();
  return null;
}

function setup(props: Partial<VoteModalProps> = {}) {
  const onClose = vi.fn();
  const onRecorded = vi.fn();
  render(
    <CommitteeProvider initial={initial()}>
      <VoteModal subject="Motion X" onClose={onClose} onRecorded={onRecorded} {...props} />
      <Probe />
    </CommitteeProvider>,
  );
  return { user: userEvent.setup(), onClose, onRecorded };
}

async function enter(user: ReturnType<typeof userEvent.setup>, label: string, n: number) {
  const input = screen.getByRole('spinbutton', { name: label });
  await user.clear(input);
  await user.type(input, String(n));
}

const record = () => screen.getByRole('button', { name: 'Record vote' });
const status = () => screen.getByRole('status').textContent;

beforeEach(() => localStorage.clear());

describe('VoteModal', () => {
  it('shows eligible count and defaults to procedural quick count', () => {
    setup();
    expect(screen.getByText('4 delegates present')).toBeInTheDocument();
    expect(screen.getByText('Voting on: Motion X')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Abstain' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Procedural' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('No votes entered yet.')).toBeInTheDocument();
    expect(record()).toBeDisabled();
  });

  it('previews pass and fail', async () => {
    const { user } = setup();
    await enter(user, 'For', 3);
    await enter(user, 'Against', 1);
    expect(status()).toContain('PASSES');
    expect(status()).toContain('3 needed of 4 cast');
    await enter(user, 'For', 2);
    await enter(user, 'Against', 2);
    expect(status()).toContain('FAILS');
  });

  it('rest against fills the remainder', async () => {
    const { user } = setup();
    await enter(user, 'For', 1);
    await user.click(screen.getByRole('button', { name: 'Rest against' }));
    expect(screen.getByRole('spinbutton', { name: 'Against' })).toHaveValue(3);
    await user.click(screen.getByRole('button', { name: 'Rest for' }));
    expect(screen.getByRole('spinbutton', { name: 'For' })).toHaveValue(1);
  });

  it('shows validation alert when total exceeds eligible', async () => {
    const { user } = setup();
    await enter(user, 'For', 3);
    await enter(user, 'Against', 2);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(record()).toBeDisabled();
  });

  it('records a vote', async () => {
    const { user, onClose, onRecorded } = setup();
    await enter(user, 'For', 3);
    await enter(user, 'Against', 1);
    await user.click(record());
    const v = latest.state.votes[0];
    expect(v.procedural).toBe(true);
    expect(v.ballots).toBeNull();
    expect(v.passed).toBe(true);
    expect(v.subject).toBe('Motion X');
    expect(onRecorded).toHaveBeenCalledWith(true);
    expect(onClose).toHaveBeenCalled();
  });

  it('applies extraActions in the same undo step', async () => {
    const { user } = setup({
      extraActions: (passed) => (passed ? [{ type: 'committee/update', topic: 'New topic' }] : []),
    });
    await enter(user, 'For', 3);
    await user.click(record());
    expect(latest.state.votes).toHaveLength(1);
    expect(latest.state.topic).toBe('New topic');
    const { act } = await import('@testing-library/react');
    act(() => latest.undo());
    expect(latest.state.votes).toHaveLength(0);
    expect(latest.state.topic).not.toBe('New topic');
  });

  it('applies two-thirds threshold', async () => {
    const { user } = setup({ threshold: 'two_thirds' });
    await enter(user, 'For', 2);
    await enter(user, 'Against', 1);
    expect(status()).toContain('PASSES');
    expect(status()).toContain('2 needed of 3 cast');
    await enter(user, 'Against', 2);
    expect(status()).toContain('FAILS');
    expect(status()).toContain('3 needed of 4 cast');
  });

  it('roll call: abstain rules, counting, toggling, all for', async () => {
    const { user } = setup({ procedural: false });
    expect(screen.getByRole('radio', { name: 'Substantive' })).toHaveAttribute('aria-checked', 'true');
    const kenya = within(screen.getByRole('radiogroup', { name: 'Vote of Kenya' }));
    const ethiopia = within(screen.getByRole('radiogroup', { name: 'Vote of Ethiopia' }));
    expect(kenya.getByRole('radio', { name: 'Abstain' })).toBeDisabled();
    expect(ethiopia.getByRole('radio', { name: 'Abstain' })).toBeEnabled();
    expect(screen.getByText('present & voting')).toBeInTheDocument();
    expect(screen.getByText('0 of 4 voted')).toBeInTheDocument();
    expect(screen.getByText('Delegates who have not voted are not counted.')).toBeInTheDocument();

    await user.click(ethiopia.getByRole('radio', { name: 'Abstain' }));
    await user.click(kenya.getByRole('radio', { name: 'For' }));
    expect(screen.getByText('2 of 4 voted')).toBeInTheDocument();
    expect(status()).toContain('For 1, against 0, abstain 1');
    await user.click(kenya.getByRole('radio', { name: 'For' }));
    expect(screen.getByText('1 of 4 voted')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All for' }));
    expect(screen.queryByText('Delegates who have not voted are not counted.')).toBeNull();
    await user.click(record());
    const v = latest.state.votes[0];
    expect(Object.keys(v.ballots ?? {}).sort()).toEqual(['et', 'gb', 'ke', 'us']);
    expect(v.passed).toBe(true);
    expect(v.procedural).toBe(false);
  });

  it('switching to procedural clears abstain ballots', async () => {
    const { user } = setup({ procedural: false });
    const ethiopia = within(screen.getByRole('radiogroup', { name: 'Vote of Ethiopia' }));
    await user.click(ethiopia.getByRole('radio', { name: 'Abstain' }));
    expect(screen.getByText('1 of 4 voted')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Procedural' }));
    expect(screen.getByText('0 of 4 voted')).toBeInTheDocument();
  });

  it('editable subject must be non-blank and is trimmed', async () => {
    const { user } = setup({ subject: '', editableSubject: true });
    await enter(user, 'For', 3);
    expect(record()).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Voting on' }), '  Ad hoc  ');
    expect(record()).toBeEnabled();
    await user.click(record());
    expect(latest.state.votes[0].subject).toBe('Ad hoc');
  });

  it('defaults to roll call when substantive', () => {
    setup({ procedural: false });
    expect(screen.getByRole('radio', { name: 'Roll call' })).toHaveAttribute('aria-checked', 'true');
  });
});
