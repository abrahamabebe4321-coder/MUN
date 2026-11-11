import type { Delegate, Interaction, InteractionKind, ScoringConfig, Tier } from './types';

export const DEFAULT_SCORING: ScoringConfig = {
  base: {
    opening_speech: 5,
    gsl_speech: 6,
    mod_speech: 6,
    resolution_speech: 8,
    amendment_speech: 4,
    amendment_proposed: 3,
    poi_asked: 2,
    poi_answer: 2,
    follow_up: 1,
    motion_raised: 1,
    point_of_order: 1,
    parliamentary_inquiry: 1,
    personal_privilege: 0,
    unmod_leadership: 3,
    sponsor: 5,
    signatory: 1,
    penalty: -2,
  },
  tierMultiplier: { 1: 1, 2: 2, 3: 3 },
  passBonus: { motion_raised: 1, amendment_proposed: 2 },
  flatKinds: ['sponsor', 'signatory', 'personal_privilege'],
};

export const KIND_LABELS: Record<InteractionKind, string> = {
  opening_speech: 'Opening speech',
  gsl_speech: 'GSL speech',
  mod_speech: 'Moderated caucus speech',
  resolution_speech: 'Resolution speech',
  amendment_speech: 'Amendment speech',
  amendment_proposed: 'Amendment proposed',
  poi_asked: 'POI asked',
  poi_answer: 'POI answer',
  follow_up: 'Follow-up',
  motion_raised: 'Motion raised',
  point_of_order: 'Point of order',
  parliamentary_inquiry: 'Parliamentary inquiry',
  personal_privilege: 'Personal privilege',
  unmod_leadership: 'Unmod leadership',
  sponsor: 'Sponsor',
  signatory: 'Signatory',
  penalty: 'Penalty',
};

export const TIER_LABELS: Record<Tier, string> = { 1: 'Works', 2: 'Decent', 3: 'Insightful' };

export type Category = 'speeches' | 'pois' | 'procedure' | 'resolutions' | 'conduct';

export const CATEGORY_LABELS: Record<Category, string> = {
  speeches: 'Speeches',
  pois: 'POIs',
  procedure: 'Motions & points',
  resolutions: 'Resolution work',
  conduct: 'Conduct',
};

const CATEGORY_BY_KIND: Record<InteractionKind, Category> = {
  opening_speech: 'speeches',
  gsl_speech: 'speeches',
  mod_speech: 'speeches',
  poi_asked: 'pois',
  poi_answer: 'pois',
  follow_up: 'pois',
  motion_raised: 'procedure',
  point_of_order: 'procedure',
  parliamentary_inquiry: 'procedure',
  personal_privilege: 'procedure',
  resolution_speech: 'resolutions',
  amendment_speech: 'resolutions',
  amendment_proposed: 'resolutions',
  sponsor: 'resolutions',
  signatory: 'resolutions',
  unmod_leadership: 'resolutions',
  penalty: 'conduct',
};

export function categoryOf(kind: InteractionKind): Category {
  return CATEGORY_BY_KIND[kind];
}

export function scoreInteraction(
  i: Pick<Interaction, 'kind' | 'tier' | 'passed'>,
  cfg: ScoringConfig,
): number {
  const mult = cfg.flatKinds.includes(i.kind) ? 1 : cfg.tierMultiplier[i.tier];
  const bonus = i.passed ? (cfg.passBonus[i.kind] ?? 0) : 0;
  return cfg.base[i.kind] * mult + bonus;
}

export interface DelegateScore {
  delegateId: string;
  total: number;
  byCategory: Record<Category, number>;
  count: number;
  tierCounts: Record<Tier, number>;
}

function emptyScore(delegateId: string): DelegateScore {
  return {
    delegateId,
    total: 0,
    byCategory: { speeches: 0, pois: 0, procedure: 0, resolutions: 0, conduct: 0 },
    count: 0,
    tierCounts: { 1: 0, 2: 0, 3: 0 },
  };
}

export function scoreDelegates(
  delegateIds: string[],
  interactions: Interaction[],
  cfg: ScoringConfig,
): Record<string, DelegateScore> {
  const out: Record<string, DelegateScore> = {};
  for (const id of delegateIds) out[id] = emptyScore(id);
  for (const i of interactions) {
    const s = out[i.delegateId];
    if (!s) continue;
    const pts = scoreInteraction(i, cfg);
    s.total += pts;
    s.byCategory[categoryOf(i.kind)] += pts;
    s.count += 1;
    if (i.kind !== 'penalty' && !cfg.flatKinds.includes(i.kind)) s.tierCounts[i.tier] += 1;
  }
  return out;
}

export interface RankedDelegate extends DelegateScore {
  rank: number;
  name: string;
}

export function rankDelegates(
  delegates: Pick<Delegate, 'id' | 'name'>[],
  interactions: Interaction[],
  cfg: ScoringConfig,
): RankedDelegate[] {
  const scores = scoreDelegates(
    delegates.map((d) => d.id),
    interactions,
    cfg,
  );
  const rows = delegates.map((d) => ({ ...scores[d.id], name: d.name, rank: 0 }));
  rows.sort(
    (a, b) =>
      b.total - a.total ||
      b.tierCounts[3] - a.tierCounts[3] ||
      b.tierCounts[2] - a.tierCounts[2] ||
      a.name.localeCompare(b.name),
  );
  rows.forEach((r, idx) => {
    r.rank = idx > 0 && rows[idx - 1].total === r.total ? rows[idx - 1].rank : idx + 1;
  });
  return rows;
}
