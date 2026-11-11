import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ProjectorView } from './ProjectorView';
import { createCommittee } from '../state/state';
import type { CommitteeState } from '../state/state';
import { reducer } from '../state/reducer';
import type { Action } from '../state/reducer';
import { saveState, STORAGE_KEY } from '../state/storage';

const T0 = new Date('2026-01-01T12:00:00Z').getTime();

function build(actions: Action[]): CommitteeState {
  return actions.reduce(reducer, createCommittee());
}

const NAMES: [string, string][] = [
  ['fr', 'France'],
  ['de', 'Germany'],
  ['jp', 'Japan'],
  ['br', 'Brazil'],
  ['in', 'India'],
  ['kr', 'Korea'],
  ['mx', 'Mexico'],
  ['ca', 'Canada'],
];

function running(extra: Action[] = []): CommitteeState {
  return build([
    { type: 'committee/update', name: 'Security Council', topic: 'Water rights' },
    ...NAMES.map(([id, name]) => ({ type: 'delegate/add', id, name, flag: id }) as Action),
    { type: 'committee/setStage', stage: 'running' },
    ...extra,
  ]);
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('ProjectorView', () => {
  it('waits when nothing is stored', () => {
    render(<ProjectorView />);
    expect(screen.getByText('Waiting for the chair to start the committee…')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Projector view' })).toBeInTheDocument();
  });

  it('waits during setup', () => {
    saveState(createCommittee());
    render(<ProjectorView />);
    expect(screen.getByText('Waiting for the chair to start the committee…')).toBeInTheDocument();
  });

  it('shows header details', () => {
    saveState(running());
    render(<ProjectorView />);
    expect(screen.getByText('Security Council')).toBeInTheDocument();
    expect(screen.getByText('Water rights')).toBeInTheDocument();
    expect(screen.getByText('Session 1')).toBeInTheDocument();
    expect(screen.getByText('Debate paused')).toBeInTheDocument();
  });

  it('shows a moderated caucus with speaker and queue', () => {
    saveState(
      running([
        { type: 'debate/start', mode: 'mod', topic: 'Dams', totalSeconds: 600, speakerSeconds: 60 },
        ...(['fr', 'de', 'jp', 'br', 'in', 'kr', 'mx', 'ca'] as const).map(
          (id) => ({ type: 'speakers/add', id }) as Action,
        ),
        { type: 'speakers/next' },
      ]),
    );
    render(<ProjectorView />);
    expect(screen.getByText('Moderated caucus')).toBeInTheDocument();
    expect(screen.getByText('Dams')).toBeInTheDocument();
    expect(screen.getByText('France')).toBeInTheDocument();
    expect(screen.getByText('1:00')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('Caucus time')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Germany', 'Japan', 'Brazil', 'India', 'Korea', 'Mexico']);
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('shows only the big timer for an unmoderated caucus', () => {
    saveState(running([{ type: 'debate/start', mode: 'unmod', totalSeconds: 300 }]));
    render(<ProjectorView />);
    expect(screen.getByText('Unmoderated caucus')).toBeInTheDocument();
    expect(screen.getByText('Time remaining')).toBeInTheDocument();
    expect(screen.getByText('5:00')).toBeInTheDocument();
    expect(screen.queryByText('Next speakers')).not.toBeInTheDocument();
  });

  it('lists pending motions in voting order and hides when none', () => {
    const withMotions = running([
      { type: 'motion/add', motionType: 'gsl', proposerId: 'de', speakerSeconds: 60 },
      { type: 'motion/add', motionType: 'unmod', proposerId: 'jp', totalSeconds: 300 },
    ]);
    saveState(withMotions);
    const { unmount } = render(<ProjectorView />);
    expect(screen.getByText('Motions on the floor')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    const motionItems = items.filter((t) => t.includes('proposed by'));
    expect(motionItems[0]).toContain('Unmoderated caucus');
    expect(motionItems[0]).toContain('Japan');
    expect(motionItems[1]).toContain('General speakers list');
    expect(motionItems[1]).toContain('Germany');
    unmount();
    saveState(running());
    render(<ProjectorView />);
    expect(screen.queryByText('Motions on the floor')).not.toBeInTheDocument();
  });

  it('shows the latest vote banner only while fresh', () => {
    const vote: Action = {
      type: 'vote/record',
      subject: 'Motion to adjourn',
      procedural: true,
      threshold: 'simple',
      counts: { for: 5, against: 2, abstain: 1 },
      now: T0 - 10_000,
    };
    saveState(running([vote]));
    const { unmount } = render(<ProjectorView />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveClass('is-passed');
    expect(banner).toHaveTextContent('Motion to adjourn');
    expect(banner).toHaveTextContent('PASSED');
    expect(banner).toHaveTextContent('For 5, against 2, abstain 1');
    unmount();
    saveState(running([{ ...vote, now: T0 - 31_000 } as Action]));
    render(<ProjectorView />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the ended message', () => {
    saveState({ ...running(), stage: 'ended' });
    render(<ProjectorView />);
    expect(screen.getByText('The conference has ended')).toBeInTheDocument();
    expect(screen.queryByText('Next speakers')).not.toBeInTheDocument();
  });

  it('updates on a storage event', () => {
    saveState(running());
    render(<ProjectorView />);
    expect(screen.getByText('Debate paused')).toBeInTheDocument();
    saveState(running([{ type: 'debate/start', mode: 'gsl' }]));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    });
    expect(screen.getByText('General speakers list')).toBeInTheDocument();
  });

  it('never shows scores or leaderboard', () => {
    saveState(
      running([
        {
          type: 'interaction/add',
          delegateId: 'fr',
          kind: 'gsl_speech',
          tier: 3,
          note: 'Insightful',
          now: T0,
        },
      ]),
    );
    const { container } = render(<ProjectorView />);
    expect(container.textContent).not.toMatch(/Insightful|points|Leaderboard/i);
  });
});
