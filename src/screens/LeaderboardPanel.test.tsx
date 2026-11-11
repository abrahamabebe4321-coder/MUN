import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommitteeProvider, useCommittee } from '../state/CommitteeContext';
import { createCommittee } from '../state/state';
import { reducer } from '../state/reducer';
import type { Action } from '../state/reducer';
import { LeaderboardPanel } from './LeaderboardPanel';

function initial() {
  let s = createCommittee();
  s.stage = 'running';
  s.delegates = [
    { id: 'et', name: 'Ethiopia', flag: 'et', attendance: 'present' },
    { id: 'ke', name: 'Kenya', flag: 'ke', attendance: 'present' },
    { id: 'us', name: 'United States', flag: 'us', attendance: 'absent' },
  ];
  const acts: Action[] = [
    { type: 'resolution/add', name: 'Res A', sponsorIds: ['ke'] },
    { type: 'interaction/add', delegateId: 'et', kind: 'gsl_speech', tier: 3, now: 1 },
    { type: 'interaction/add', delegateId: 'et', kind: 'poi_asked', tier: 2, now: 2 },
    { type: 'interaction/add', delegateId: 'ke', kind: 'penalty', tier: 1, now: 3 },
    { type: 'interaction/add', delegateId: 'ke', kind: 'mod_speech', tier: 1, now: 4 },
  ];
  for (const a of acts) s = reducer(s, a);
  return s;
}

function Probe() {
  const { state } = useCommittee();
  return (
    <div data-testid="probe">
      {state.interactions.map((i) => `${i.id}:${i.kind}:${i.tier}:${i.note}`).join('|')}
    </div>
  );
}

function setup() {
  render(
    <CommitteeProvider initial={initial()}>
      <LeaderboardPanel />
      <Probe />
    </CommitteeProvider>,
  );
  return userEvent.setup();
}

const bodyRows = () => within(screen.getAllByRole('table')[0]).getAllByRole('row').slice(1);
const cells = (row: HTMLElement) => within(row).getAllByRole('cell');

beforeEach(() => localStorage.clear());

describe('LeaderboardPanel', () => {
  it('shows the Scores heading', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Scores' })).toBeInTheDocument();
  });

  it('orders rows and shows ranks and points', () => {
    setup();
    const rows = bodyRows();
    expect(rows).toHaveLength(3);
    expect(cells(rows[0])[1]).toHaveTextContent('Ethiopia');
    expect(cells(rows[0])[2]).toHaveTextContent('22');
    expect(cells(rows[1])[1]).toHaveTextContent('Kenya');
    expect(cells(rows[1])[2]).toHaveTextContent('9');
    expect(cells(rows[2])[1]).toHaveTextContent('United States');
    expect(cells(rows[2])[2]).toHaveTextContent('0');
    expect(rows.map((r) => cells(r)[0].textContent)).toEqual(['1', '2', '3']);
    expect(rows[0]).toHaveClass('lb-rank-1');
    expect(rows[1]).toHaveClass('lb-rank-2');
    expect(rows[2]).not.toHaveClass('lb-rank-3');
  });

  it('shows category cells, negatives and dashes', () => {
    setup();
    const [et, ke, us] = bodyRows();
    expect(cells(et)[3]).toHaveTextContent('18');
    expect(cells(et)[4]).toHaveTextContent('4');
    expect(cells(et)[5]).toHaveTextContent('–');
    expect(cells(ke)[6]).toHaveTextContent('5');
    expect(cells(ke)[7]).toHaveTextContent('-2');
    expect(cells(ke)[7]).toHaveClass('lb-neg');
    expect(cells(us)[3]).toHaveTextContent('–');
  });

  it('dims absent delegates', () => {
    setup();
    const rows = bodyRows();
    expect(rows[2]).toHaveClass('lb-absent');
    expect(rows[0]).not.toHaveClass('lb-absent');
  });

  it('lists recent activity newest first and deletes', async () => {
    const user = setup();
    await user.click(screen.getByText('Recent activity (4)'));
    const items = within(screen.getByText('Recent activity (4)').closest('details') as HTMLElement).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Moderated caucus speech');
    expect(items[0]).toHaveTextContent('+6');
    expect(items[3]).toHaveTextContent('GSL speech');
    await user.click(screen.getByRole('button', { name: 'Delete GSL speech for Ethiopia' }));
    expect(cells(bodyRows()[0])[1]).toHaveTextContent('Kenya');
    expect(screen.getByTestId('probe').textContent).not.toContain('gsl_speech');
  });

  it('opens the log modal and edits quality', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Show log for Ethiopia' }));
    const dialog = screen.getByRole('dialog', { name: 'Ethiopia — 22 points' });
    await user.selectOptions(within(dialog).getByLabelText('Quality for GSL speech'), '1');
    expect(screen.getByTestId('probe').textContent).toContain(':gsl_speech:1:');
    expect(screen.getByRole('dialog', { name: 'Ethiopia — 10 points' })).toBeInTheDocument();
  });

  it('saves a note on blur', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Show log for Ethiopia' }));
    const dialog = screen.getByRole('dialog');
    const notes = within(dialog).getAllByLabelText('Note');
    await user.type(notes[0], 'good point');
    await user.tab();
    expect(screen.getByTestId('probe').textContent).toContain('good point');
  });

  it('shows synthetic rows without controls and deletes real ones', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Show log for Kenya' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Sponsor')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Delete Sponsor' })).toBeNull();
    expect(within(dialog).queryByLabelText('Quality for Sponsor')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Delete Penalty' }));
    expect(screen.getByTestId('probe').textContent).not.toContain('penalty');
    expect(screen.getByRole('dialog', { name: 'Kenya — 11 points' })).toBeInTheDocument();
  });
});
