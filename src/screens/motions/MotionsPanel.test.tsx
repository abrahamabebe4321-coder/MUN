import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { CommitteeProvider, useCommittee } from '../../state/CommitteeContext';
import { createCommittee } from '../../state/state';
import type { CommitteeState } from '../../state/state';
import { reducer } from '../../state/reducer';
import type { Action } from '../../state/reducer';
import { createTimer } from '../../domain/timer';
import type { Motion } from '../../domain/types';
import { NavContext } from '../nav';
import { MotionsPanel, outcomeActions, startsDebate } from './MotionsPanel';

function base(): CommitteeState {
  const s = createCommittee();
  s.stage = 'running';
  s.delegates = [
    ['et', 'Ethiopia', 'present'],
    ['ke', 'Kenya', 'present'],
    ['us', 'United States', 'present'],
    ['gb', 'United Kingdom', 'present'],
    ['fr', 'France', 'absent'],
  ].map(([id, name, attendance]) => ({ id, name, flag: id, attendance: attendance as 'present' }));
  return s;
}

function withActions(...actions: Action[]): CommitteeState {
  return actions.reduce(reducer, base());
}

const add = (motionType: Motion['type'], proposerId: string, extra: Partial<Action> = {}): Action =>
  ({ type: 'motion/add', motionType, proposerId, ...extra }) as Action;

let latest: ReturnType<typeof useCommittee>;
function Probe() {
  latest = useCommittee();
  return null;
}

function setup(s: CommitteeState = base()) {
  const navSpy = vi.fn();
  render(
    <CommitteeProvider initial={s}>
      <NavContext.Provider value={navSpy}>
        <MotionsPanel />
        <Probe />
      </NavContext.Provider>
    </CommitteeProvider>,
  );
  return { user: userEvent.setup(), navSpy };
}

async function pick(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('combobox', { name: 'Proposed by' }));
  await user.click(screen.getByRole('option', { name: new RegExp(name) }));
}

async function vote(user: ReturnType<typeof userEvent.setup>, f: number, a: number) {
  for (const [label, n] of [['For', f], ['Against', a]] as const) {
    const input = screen.getByRole('spinbutton', { name: label });
    await user.clear(input);
    await user.type(input, String(n));
  }
  await user.click(screen.getByRole('button', { name: 'Record vote' }));
}

const submit = () => screen.getByRole('button', { name: 'Add to the floor' });
const floor = () => within(screen.getByRole('list', { name: '' }) as HTMLElement);

beforeEach(() => localStorage.clear());

describe('raise form', () => {
  it('needs a proposer and a topic', async () => {
    const { user } = setup();
    expect(submit()).toBeDisabled();
    await pick(user, 'Kenya');
    expect(submit()).toBeDisabled();
    await user.type(screen.getByLabelText('Topic'), '  Water  ');
    expect(submit()).toBeEnabled();
  });

  it('offers present delegates only', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('combobox', { name: 'Proposed by' }));
    expect(screen.getByRole('option', { name: /Kenya/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /France/ })).not.toBeInTheDocument();
  });

  it('creates motion and linked interaction in one undo step; keeps type and times', async () => {
    const { user } = setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Motion type' }), 'mod');
    await pick(user, 'Kenya');
    await user.type(screen.getByLabelText('Topic'), '  Water  ');
    await user.click(within(screen.getByRole('radiogroup', { name: 'Motion quality' })).getByRole('radio', { name: /^Insightful/ }));
    const total = screen.getByLabelText('Total time');
    await user.clear(total);
    await user.type(total, '15:00{Enter}');
    await user.click(submit());
    const m = latest.state.motions[0];
    expect(m).toMatchObject({ type: 'mod', proposerId: 'ke', topic: 'Water', totalSeconds: 900, speakerSeconds: 60, status: 'pending' });
    expect(latest.state.interactions).toHaveLength(1);
    expect(latest.state.interactions[0]).toMatchObject({ kind: 'motion_raised', delegateId: 'ke', tier: 3, refId: m.id });
    expect(screen.getByLabelText('Topic')).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Proposed by' })).toHaveValue('');
    expect(screen.getByLabelText('Total time')).toHaveValue('15:00');
    expect(screen.getByRole('combobox', { name: 'Motion type' })).toHaveValue('mod');
    act(() => latest.undo());
    expect(latest.state.motions).toHaveLength(0);
    expect(latest.state.interactions).toHaveLength(0);
  });
});

describe('floor', () => {
  const three = () =>
    withActions(
      add('mod', 'et', { topic: 'A', totalSeconds: 600, speakerSeconds: 60 }),
      add('unmod', 'ke', { totalSeconds: 900 }),
      add('mod', 'us', { topic: 'B', totalSeconds: 900, speakerSeconds: 60 }),
    );

  it('lists motions in voting order', () => {
    setup(three());
    const items = screen.getAllByRole('listitem').filter((li) => li.classList.contains('motions-item'));
    const labels = items.slice(0, 3).map((li) => li.getAttribute('aria-label'));
    expect(labels[0]).toMatch(/^Unmoderated caucus/);
    expect(labels[1]).toMatch(/"B"/);
    expect(labels[2]).toMatch(/"A"/);
    void floor;
  });

  it('passing vote carries out the first motion and withdraws the rest', async () => {
    let s = three();
    s = reducer(s, { type: 'interaction/add', delegateId: 'ke', kind: 'motion_raised', tier: 1, refId: 'm2', now: 1 });
    const { user, navSpy } = setup(s);
    const first = screen.getByRole('listitem', { name: /Unmoderated caucus/ });
    await user.click(within(first).getByRole('button', { name: 'Vote' }));
    await vote(user, 3, 1);
    const st = latest.state;
    const byType = (id: string) => st.motions.find((m) => m.id === id)!;
    expect(byType('m2').status).toBe('passed');
    expect(byType('m1').status).toBe('withdrawn');
    expect(byType('m3').status).toBe('withdrawn');
    expect(st.interactions[0].passed).toBe(true);
    expect(st.debate.mode).toBe('unmod');
    expect(st.debate.caucusTimer?.durationMs).toBe(900_000);
    expect(navSpy).toHaveBeenCalledWith('debate');
    expect(st.votes).toHaveLength(1);
    act(() => latest.undo());
    expect(latest.state.motions.every((m) => m.status === 'pending')).toBe(true);
    expect(latest.state.votes).toHaveLength(0);
    expect(latest.state.debate.mode).toBe('none');
    expect(latest.state.interactions[0].passed).toBe(false);
  });

  it('failing vote only fails that motion', async () => {
    const { user, navSpy } = setup(three());
    const first = screen.getByRole('listitem', { name: /Unmoderated caucus/ });
    await user.click(within(first).getByRole('button', { name: 'Vote' }));
    await vote(user, 1, 3);
    expect(latest.state.motions.map((m) => m.status)).toEqual(['pending', 'failed', 'pending']);
    expect(navSpy).not.toHaveBeenCalled();
  });

  it('pass without vote starts the caucus', async () => {
    const { user, navSpy } = setup(withActions(add('mod', 'et', { topic: 'Water', totalSeconds: 600, speakerSeconds: 45 })));
    await user.click(screen.getByRole('button', { name: 'Pass without vote' }));
    expect(latest.state.debate).toMatchObject({ mode: 'mod', topic: 'Water', speakerSeconds: 45 });
    expect(latest.state.debate.caucusTimer?.durationMs).toBe(600_000);
    expect(latest.state.motions[0].status).toBe('passed');
    expect(navSpy).toHaveBeenCalledWith('debate');
  });

  it('extend adds time to the running caucus', async () => {
    const s0 = withActions({ type: 'debate/start', mode: 'unmod', totalSeconds: 600 }, add('extend', 'et', { totalSeconds: 120 }));
    const { user } = setup(s0);
    await user.click(screen.getByRole('button', { name: 'Pass without vote' }));
    expect(latest.state.debate.caucusTimer?.durationMs).toBe(720_000);
  });

  it('set_agenda updates the committee topic', async () => {
    const { user } = setup(withActions(add('set_agenda', 'et', { topic: 'Climate' })));
    await user.click(screen.getByRole('button', { name: 'Pass without vote' }));
    expect(latest.state.topic).toBe('Climate');
  });

  it('Fail, Withdraw, Bring back and Clear the floor', async () => {
    const { user } = setup(three());
    const first = screen.getByRole('listitem', { name: /Unmoderated caucus/ });
    await user.click(within(first).getByRole('button', { name: 'More for motion 1' }));
    await user.click(screen.getByRole('menuitem', { name: 'Withdraw' }));
    expect(latest.state.motions[1].status).toBe('withdrawn');
    await user.click(screen.getByText('Earlier motions (1)', { selector: 'summary' }));
    await user.click(screen.getByRole('button', { name: /^Bring back: Unmoderated/ }));
    expect(latest.state.motions[1].status).toBe('pending');
    const second = screen.getByRole('listitem', { name: /Unmoderated caucus/ });
    await user.click(within(second).getByRole('button', { name: 'More for motion 1' }));
    await user.click(screen.getByRole('menuitem', { name: 'Fail' }));
    expect(latest.state.motions[1].status).toBe('failed');
    await user.click(screen.getByRole('button', { name: /^Bring back: Unmoderated/ }));
    await user.click(screen.getByRole('button', { name: 'Clear the floor' }));
    expect(latest.state.motions.every((m) => m.status === 'withdrawn')).toBe(true);
    expect(screen.getByText('No motions on the floor. Add one above.')).toBeInTheDocument();
  });
});

describe('vote record', () => {
  it('lists newest first and deletes', async () => {
    let s = base();
    s = reducer(s, { type: 'vote/record', subject: 'Old one', procedural: true, threshold: 'simple', counts: { for: 3, against: 1, abstain: 0 }, now: 1 });
    s = reducer(s, { type: 'vote/record', subject: 'New one', procedural: false, threshold: 'two_thirds', counts: { for: 1, against: 2, abstain: 1 }, ballots: { et: 'for' }, now: 2 });
    const { user } = setup(s);
    await user.click(screen.getByText('Vote record (2)', { selector: 'summary' }));
    const subs = screen.getAllByText(/^(Old|New) one$/).map((e) => e.textContent);
    expect(subs).toEqual(['New one', 'Old one']);
    expect(screen.getByText('For 1, against 2, abstain 1')).toBeInTheDocument();
    expect(screen.getByText('Substantive, two-thirds, session 1')).toBeInTheDocument();
    expect(screen.getByText('Roll call', { selector: 'summary' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete vote: New one' }));
    expect(latest.state.votes.map((v) => v.subject)).toEqual(['Old one']);
  });

  it('New vote records a substantive vote', async () => {
    const { user } = setup();
    await user.click(screen.getByText('Vote record (0)', { selector: 'summary' }));
    expect(screen.getByText('No votes recorded yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New vote' }));
    await user.type(screen.getByRole('textbox', { name: 'Voting on' }), 'Resolution 1');
    await user.click(screen.getByRole('radio', { name: 'Quick count' }));
    await vote(user, 3, 1);
    expect(latest.state.votes[0]).toMatchObject({ subject: 'Resolution 1', procedural: false, passed: true });
  });
});

describe('helpers', () => {
  const m: Motion = { id: 'm1', type: 'mod', proposerId: 'et', topic: 'T', totalSeconds: 600, speakerSeconds: 60, status: 'pending', raisedOrder: 1, session: 1 };
  it('startsDebate', () => {
    expect(['mod', 'unmod', 'gsl'].every((t) => startsDebate(t as Motion['type']))).toBe(true);
    expect(startsDebate('extend')).toBe(false);
  });
  it('outcomeActions', () => {
    expect(outcomeActions(m, false, 5)).toEqual([{ type: 'motion/setStatus', id: 'm1', status: 'failed' }]);
    expect(outcomeActions(m, true, 5)).toEqual([
      { type: 'motion/setStatus', id: 'm1', status: 'passed' },
      { type: 'timer', which: 'both', op: 'pause', now: 5 },
      { type: 'debate/start', mode: 'mod', topic: 'T', totalSeconds: 600, speakerSeconds: 60 },
      { type: 'motion/clearPending' },
    ]);
    expect(outcomeActions({ ...m, type: 'roll_call' }, true, 5)).toHaveLength(2);
    expect(outcomeActions({ ...m, type: 'extend', totalSeconds: 120 }, true, 5)[1]).toEqual({ type: 'timer', which: 'caucus', op: 'add', seconds: 120, now: 5 });
    void createTimer;
  });
});
