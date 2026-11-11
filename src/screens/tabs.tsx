import type { ReactNode } from 'react';
import { RollCallPanel } from './RollCallPanel';

export type TabId = 'debate' | 'motions' | 'resolutions' | 'leaderboard' | 'rollcall' | 'settings';

export function Placeholder({ name }: { name: string }) {
  return (
    <div className="card muted">
      <p>{name} — coming soon</p>
    </div>
  );
}

export const TABS: { id: TabId; label: string; render: () => ReactNode }[] = [
  { id: 'debate', label: 'Debate', render: () => <Placeholder name="Debate" /> },
  { id: 'motions', label: 'Motions & voting', render: () => <Placeholder name="Motions & voting" /> },
  { id: 'resolutions', label: 'Resolutions', render: () => <Placeholder name="Resolutions" /> },
  { id: 'leaderboard', label: 'Leaderboard', render: () => <Placeholder name="Leaderboard" /> },
  { id: 'rollcall', label: 'Roll call', render: () => <RollCallPanel /> },
  { id: 'settings', label: 'Settings', render: () => <Placeholder name="Settings" /> },
];
