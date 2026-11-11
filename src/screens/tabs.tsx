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

export const TABS: { id: TabId; label: string; inBar: boolean; render: () => ReactNode }[] = [
  { id: 'debate', label: 'Debate', inBar: true, render: () => <DebatePanel /> },
  { id: 'motions', label: 'Motions', inBar: true, render: () => <MotionsPanel /> },
  { id: 'resolutions', label: 'Resolutions', inBar: true, render: () => <ResolutionsPanel /> },
  { id: 'leaderboard', label: 'Scores', inBar: true, render: () => <LeaderboardPanel /> },
  { id: 'rollcall', label: 'Roll call', inBar: false, render: () => <RollCallPanel /> },
  { id: 'settings', label: 'Settings', inBar: false, render: () => <SettingsPanel /> },
];
