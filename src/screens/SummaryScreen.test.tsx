import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommitteeProvider, useCommittee } from '../state/CommitteeContext';
import { reducer } from '../state/reducer';
import type { Action } from '../state/reducer';
import { createCommittee } from '../state/state';
import type { CommitteeState } from '../state/state';
import { SummaryScreen } from './SummaryScreen';

let t = 0;
function build(actions: Action[]): CommitteeState {
  const s = actions.reduce(reducer, createCommittee());
  return { ...s, stage: 'ended', name: 'GA1 Plenary', topic: 'Veto reform' };
}
const add = (delegateId: string, kind: 'gsl_speech' | 'poi_asked' | 'penalty', tier: 1 | 2 | 3, note = ''): Action => ({
  type: 'interaction/add',
  delegateId,
  kind,
  tier,
  note,
  now: ++t,
});

function populated(): CommitteeState {
  return build([
    { type: 'delegate/add', id: 'a', name: 'Alpha', flag: 'et' },
    { type: 'delegate/add', id: 'b', name: 'Bravo', flag: 'ke' },
    { type: 'delegate/add', id: 'c', name: 'Charlie', flag: 'us' },
    add('a', 'gsl_speech', 3, 'Great opener'),
    add('a', 'poi_asked', 1),
    add('b', 'gsl_speech', 2),
    add('b', 'penalty', 1),
    { type: 'motion/add', motionType: 'gsl', proposerId: 'a' },
    { type: 'resolution/add', name: 'R1' },
  ]);
}

function Probe() {
  const { state } = useCommittee();
  return <span data-testid="stage">{state.stage}</span>;
}

function setup(s: CommitteeState) {
  render(
    <CommitteeProvider initial={s}>
      <SummaryScreen />
      <Probe />
    </CommitteeProvider>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('SummaryScreen', () => {
  it('renders heading, committee name and topic', () => {
    setup(populated());
    expect(screen.getByRole('heading', { level: 1, name: 'Conference summary' })).toBeInTheDocument();
    expect(screen.getByText('GA1 Plenary')).toBeInTheDocument();
    expect(screen.getByText('Veto reform')).toBeInTheDocument();
  });

  it('renders stat tiles', () => {
    setup(populated());
    const stats = within(screen.getByLabelText('Committee statistics'));
    expect(stats.getByText('Sessions').previousSibling).toHaveTextContent('1');
    expect(stats.getByText('Delegates').previousSibling).toHaveTextContent('3');
    expect(stats.getByText('Speeches').previousSibling).toHaveTextContent('2');
    expect(stats.getByText('POIs').previousSibling).toHaveTextContent('1');
    expect(stats.getByText('Motions passed').previousSibling).toHaveTextContent('0 of 0');
    expect(stats.getByText('Resolutions passed').previousSibling).toHaveTextContent('0 of 1');
  });

  it('renders award cards with the right delegates', () => {
    setup(populated());
    const best = within(screen.getByRole('group', { name: 'Best Delegate' }));
    expect(best.getByText('Alpha')).toBeInTheDocument();
    expect(best.getByText('20 points')).toBeInTheDocument();
    const outstanding = within(screen.getByRole('group', { name: 'Outstanding Delegate' }));
    expect(outstanding.getByText('Bravo')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Best Speaker' })).getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText(/final decision is the chair's/)).toBeInTheDocument();
  });

  it('lists the final ranking in order', () => {
    setup(populated());
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Alpha');
    expect(rows[1]).toHaveTextContent('Bravo');
    expect(rows[2]).toHaveTextContent('Charlie');
  });

  it('renders a delegate report', () => {
    setup(populated());
    const report = within(screen.getByRole('article', { name: 'Report for Alpha' }));
    expect(report.getByText('Rank 1 · 20 points')).toBeInTheDocument();
    expect(report.getByText('GSL speech × 1')).toBeInTheDocument();
    expect(report.getByText('+18')).toBeInTheDocument();
    expect(report.getByText('POI asked × 1')).toBeInTheDocument();
    expect(report.getByText('Chair notes')).toBeInTheDocument();
    expect(report.getByText('GSL speech: Great opener')).toBeInTheDocument();
    expect(report.getByRole('img', { name: 'Quality mix: 1 insightful, 0 decent, 1 works' })).toBeInTheDocument();
    const bravo = within(screen.getByRole('article', { name: 'Report for Bravo' }));
    expect(bravo.getByText('-2')).toBeInTheDocument();
    const charlie = within(screen.getByRole('article', { name: 'Report for Charlie' }));
    expect(charlie.getByText('No recorded interactions.')).toBeInTheDocument();
    expect(charlie.queryByRole('img', { name: /Quality mix/ })).toBeNull();
  });

  it('shows the empty-awards message with no interactions', () => {
    setup(build([{ type: 'delegate/add', id: 'a', name: 'Alpha', flag: 'et' }]));
    expect(
      screen.getByText('No points were recorded, so there are no awards to suggest.'),
    ).toBeInTheDocument();
  });

  it('reopens the committee', async () => {
    const user = setup(populated());
    await user.click(screen.getByRole('button', { name: 'Reopen committee' }));
    expect(screen.getByTestId('stage')).toHaveTextContent('running');
  });

  it('downloads the CSV', async () => {
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = setup(populated());
    await user.click(screen.getByRole('button', { name: 'Download results (CSV)' }));
    expect(create).toHaveBeenCalledTimes(1);
    const blob = (create.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toBe('text/csv');
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });

  it('prints', async () => {
    const print = vi.fn();
    window.print = print;
    const user = setup(populated());
    await user.click(screen.getByRole('button', { name: 'Print summary' }));
    expect(print).toHaveBeenCalled();
  });
});
