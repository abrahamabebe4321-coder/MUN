import type { ReactNode } from 'react';
import { RollCallPanel } from './RollCallPanel';
import { DebatePanel } from './debate/DebatePanel';
import { LeaderboardPanel } from './LeaderboardPanel';
import { SettingsPanel } from './SettingsPanel';
import { MotionsPanel } from './motions/MotionsPanel';
import { ResolutionsPanel } from './resolutions/ResolutionsPanel';

export type TabId = 'debate' | 'motions' | 'resolutions' | 'leaderboard' | 'rollcall' | 'settings';

export function Placeholder({ name }: { name: string }) {
  return (
    <div className="card muted">
      <p>{name} — coming soon</p>
    </div>
  );
}

export const TABS: { id: TabId; label: string; render: () => ReactNode }[] = [
  { id: 'debate', label: 'Debate', render: () => <DebatePanel /> },
  { id: 'motions', label: 'Motions & voting', render: () => <MotionsPanel /> },
  { id: 'resolutions', label: 'Resolutions', render: () => <ResolutionsPanel /> },
  { id: 'leaderboard', label: 'Leaderboard', render: () => <LeaderboardPanel /> },
  { id: 'rollcall', label: 'Roll call', render: () => <RollCallPanel /> },
  { id: 'settings', label: 'Settings', render: () => <SettingsPanel /> },
];
