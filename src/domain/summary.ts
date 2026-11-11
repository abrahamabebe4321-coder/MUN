import type { CommitteeState } from '../state/state';
import { derivedInteractions, ranking } from '../state/selectors';
import {
  CATEGORY_LABELS,
  KIND_LABELS,
  scoreInteraction,
  type Category,
  type RankedDelegate,
} from './scoring';
import type { InteractionKind } from './types';

export interface KindLine {
  kind: InteractionKind;
  label: string;
  count: number;
  points: number;
}

export interface DelegateSummary extends RankedDelegate {
  flag: string | null;
  /** Per-kind counts and points, only kinds with count > 0, ordered by points descending then label. */
  kinds: KindLine[];
  /** Non-empty chair notes, oldest first, formatted `${KIND_LABELS[kind]}: ${note}`. Synthetic sponsor/signatory entries are excluded. */
  notes: string[];
}

export interface Award {
  title: string;
  delegateIds: string[];
}

export interface CommitteeStats {
  sessions: number;
  delegates: number;
  speeches: number;
  pois: number;
  motionsPassed: number;
  motionsFailed: number;
  votes: number;
  resolutionsPassed: number;
  resolutionsTotal: number;
  interactions: number;
}

export interface Summary {
  delegates: DelegateSummary[];
  awards: Award[];
  stats: CommitteeStats;
}

const SPEECH_KINDS: InteractionKind[] = [
  'opening_speech',
  'gsl_speech',
  'mod_speech',
  'resolution_speech',
  'amendment_speech',
];

const isSynthetic = (id: string) => id.startsWith('sponsor:') || id.startsWith('signatory:');

export function buildSummary(state: CommitteeState): Summary {
  const ranked = ranking(state);
  const all = derivedInteractions(state);
  const flags = new Map(state.delegates.map((d) => [d.id, d.flag]));

  const delegates: DelegateSummary[] = ranked.map((r) => {
    const mine = all.filter((i) => i.delegateId === r.delegateId);
    const byKind = new Map<InteractionKind, KindLine>();
    for (const i of mine) {
      const line = byKind.get(i.kind) ?? {
        kind: i.kind,
        label: KIND_LABELS[i.kind],
        count: 0,
        points: 0,
      };
      line.count += 1;
      line.points += scoreInteraction(i, state.scoring);
      byKind.set(i.kind, line);
    }
    const kinds = [...byKind.values()].sort(
      (a, b) => b.points - a.points || a.label.localeCompare(b.label),
    );
    const notes = mine
      .filter((i) => !isSynthetic(i.id) && i.note.trim() !== '')
      .map((i) => `${KIND_LABELS[i.kind]}: ${i.note}`);
    return { ...r, flag: flags.get(r.delegateId) ?? null, kinds, notes };
  });

  const awards: Award[] = [];
  const qualified = delegates.filter((d) => d.total > 0);
  for (const [rank, title] of [
    [1, 'Best Delegate'],
    [2, 'Outstanding Delegate'],
    [3, 'Honourable Mention'],
  ] as const) {
    const ids = qualified.filter((d) => d.rank === rank).map((d) => d.delegateId);
    if (ids.length) awards.push({ title, delegateIds: ids });
  }
  for (const [cat, title] of [
    ['speeches', 'Best Speaker'],
    ['pois', 'Best Questioner'],
    ['resolutions', 'Best Resolution Work'],
  ] as [Category, string][]) {
    const best = Math.max(0, ...delegates.map((d) => d.byCategory[cat]));
    if (best <= 0) continue;
    awards.push({
      title,
      delegateIds: delegates.filter((d) => d.byCategory[cat] === best).map((d) => d.delegateId),
    });
  }

  const stats: CommitteeStats = {
    sessions: state.session,
    delegates: state.delegates.length,
    speeches: state.interactions.filter((i) => SPEECH_KINDS.includes(i.kind)).length,
    pois: state.interactions.filter((i) => i.kind === 'poi_asked').length,
    motionsPassed: state.motions.filter((m) => m.status === 'passed').length,
    motionsFailed: state.motions.filter((m) => m.status === 'failed').length,
    votes: state.votes.length,
    resolutionsPassed: state.resolutions.filter((r) => r.status === 'passed').length,
    resolutionsTotal: state.resolutions.length,
    interactions: state.interactions.length,
  };

  return { delegates, awards, stats };
}

export function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function summaryCsv(state: CommitteeState): string {
  const header = [
    'Rank',
    'Delegate',
    'Total',
    CATEGORY_LABELS.speeches,
    CATEGORY_LABELS.pois,
    CATEGORY_LABELS.procedure,
    CATEGORY_LABELS.resolutions,
    CATEGORY_LABELS.conduct,
    'Insightful',
    'Decent',
    'Works',
    'Entries',
  ];
  const rows = buildSummary(state).delegates.map((d) => [
    d.rank,
    d.name,
    d.total,
    d.byCategory.speeches,
    d.byCategory.pois,
    d.byCategory.procedure,
    d.byCategory.resolutions,
    d.byCategory.conduct,
    d.tierCounts[3],
    d.tierCounts[2],
    d.tierCounts[1],
    d.count,
  ]);
  return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

