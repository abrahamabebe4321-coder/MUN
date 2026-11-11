import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABELS,
  DEFAULT_SCORING,
  KIND_LABELS,
  categoryOf,
  rankDelegates,
  scoreDelegates,
  scoreInteraction,
} from './scoring';
import type { Interaction, InteractionKind, ScoringConfig, Tier } from './types';

const KINDS = Object.keys(DEFAULT_SCORING.base) as InteractionKind[];

const mk = (
  delegateId: string,
  kind: InteractionKind,
  tier: Tier = 1,
  passed = false,
): Interaction => ({
  id: Math.random().toString(36).slice(2),
  delegateId,
  kind,
  tier,
  passed,
  note: '',
  session: 1,
  timestamp: 0,
});

const s = (kind: InteractionKind, tier: Tier = 1, passed = false) =>
  scoreInteraction({ kind, tier, passed }, DEFAULT_SCORING);

describe('config coverage', () => {
  it('has 17 kinds, each with label and category', () => {
    expect(KINDS).toHaveLength(17);
    for (const k of KINDS) {
      expect(typeof DEFAULT_SCORING.base[k]).toBe('number');
      expect(KIND_LABELS[k]).toBeTruthy();
      expect(CATEGORY_LABELS[categoryOf(k)]).toBeTruthy();
    }
  });
});

describe('scoreInteraction', () => {
  it('scores speech tiers 6/12/18', () => {
    expect([1, 2, 3].map((t) => s('gsl_speech', t as Tier))).toEqual([6, 12, 18]);
  });
  it('scores POI tiers 2/4/6', () => {
    expect([1, 2, 3].map((t) => s('poi_asked', t as Tier))).toEqual([2, 4, 6]);
  });
  it('three insightful POIs equal one insightful GSL speech and beat a tier-1 speech', () => {
    const pois = 3 * s('poi_asked', 3);
    expect(pois).toBe(s('gsl_speech', 3));
    expect(pois).toBeGreaterThan(s('gsl_speech', 1));
  });
  it('flat kinds ignore tier', () => {
    for (const k of ['sponsor', 'signatory', 'personal_privilege'] as const) {
      expect(s(k, 1)).toBe(s(k, 3));
    }
    expect(s('sponsor', 3)).toBe(5);
  });
  it('pass bonus applies only when passed and only for kinds that have one', () => {
    expect(s('motion_raised', 2, false)).toBe(2);
    expect(s('motion_raised', 2, true)).toBe(3);
    expect(s('amendment_proposed', 1, true)).toBe(5);
    expect(s('gsl_speech', 1, true)).toBe(6);
  });
  it('penalties are negative per tier', () => {
    expect([1, 2, 3].map((t) => s('penalty', t as Tier))).toEqual([-2, -4, -6]);
  });
  it('custom config changes results', () => {
    const cfg: ScoringConfig = {
      ...DEFAULT_SCORING,
      tierMultiplier: { 1: 1, 2: 1, 3: 10 },
      passBonus: { gsl_speech: 5 },
    };
    expect(scoreInteraction({ kind: 'gsl_speech', tier: 3, passed: true }, cfg)).toBe(65);
    expect(scoreInteraction({ kind: 'motion_raised', tier: 1, passed: true }, cfg)).toBe(1);
  });
});

describe('scoreDelegates', () => {
  it('returns zeros for delegates with no interactions', () => {
    const r = scoreDelegates(['a'], [], DEFAULT_SCORING);
    expect(r.a.total).toBe(0);
    expect(r.a.count).toBe(0);
    expect(r.a.tierCounts).toEqual({ 1: 0, 2: 0, 3: 0 });
    expect(Object.values(r.a.byCategory).every((v) => v === 0)).toBe(true);
  });
  it('ignores unknown delegate ids', () => {
    const r = scoreDelegates(['a'], [mk('zzz', 'gsl_speech', 3)], DEFAULT_SCORING);
    expect(Object.keys(r)).toEqual(['a']);
    expect(r.a.total).toBe(0);
  });
  it('byCategory sums to total', () => {
    const r = scoreDelegates(
      ['a'],
      [mk('a', 'gsl_speech', 2), mk('a', 'poi_asked', 3), mk('a', 'motion_raised', 1, true), mk('a', 'sponsor'), mk('a', 'penalty', 2)],
      DEFAULT_SCORING,
    );
    const sum = Object.values(r.a.byCategory).reduce((x, y) => x + y, 0);
    expect(sum).toBe(r.a.total);
    expect(r.a.byCategory.speeches).toBe(12);
    expect(r.a.byCategory.pois).toBe(6);
    expect(r.a.byCategory.procedure).toBe(2);
    expect(r.a.byCategory.resolutions).toBe(5);
    expect(r.a.byCategory.conduct).toBe(-4);
    expect(r.a.count).toBe(5);
  });
  it('tierCounts exclude flat kinds and penalties', () => {
    const r = scoreDelegates(
      ['a'],
      [mk('a', 'gsl_speech', 3), mk('a', 'poi_asked', 3), mk('a', 'sponsor', 3), mk('a', 'penalty', 3), mk('a', 'personal_privilege', 2)],
      DEFAULT_SCORING,
    );
    expect(r.a.tierCounts).toEqual({ 1: 0, 2: 0, 3: 2 });
    expect(r.a.count).toBe(5);
  });
});

describe('rankDelegates', () => {
  const d = (id: string, name: string) => ({ id, name });
  it('sorts by total descending', () => {
    const r = rankDelegates(
      [d('a', 'A'), d('b', 'B')],
      [mk('a', 'poi_asked', 1), mk('b', 'gsl_speech', 1)],
      DEFAULT_SCORING,
    );
    expect(r.map((x) => x.delegateId)).toEqual(['b', 'a']);
    expect(r.map((x) => x.rank)).toEqual([1, 2]);
  });
  it('breaks ties by tier-3 count, tier-2 count, then name', () => {
    const r = rankDelegates(
      [d('x', 'Zed'), d('y', 'Amy'), d('z', 'Bob'), d('w', 'Cat')],
      [
        mk('x', 'poi_asked', 3), // 6, one t3
        mk('y', 'poi_asked', 2), mk('y', 'poi_asked', 2), // 8
        mk('z', 'poi_asked', 1), mk('z', 'poi_asked', 1), mk('z', 'poi_asked', 1), // 6, three t1
        mk('w', 'gsl_speech', 1), // 6, one t1
      ],
      DEFAULT_SCORING,
    );
    // y (8), then x (6, t3=1), then tied on t3=0 & t2=0: Bob, Cat by name
    expect(r.map((x) => x.name)).toEqual(['Amy', 'Zed', 'Bob', 'Cat']);
  });
  it('tier-2 count breaks ties after tier-3', () => {
    const r = rankDelegates(
      [d('a', 'A'), d('b', 'B')],
      [
        mk('a', 'gsl_speech', 1), mk('a', 'gsl_speech', 1), // 12, t2=0
        mk('b', 'gsl_speech', 2), // 12, t2=1
      ],
      DEFAULT_SCORING,
    );
    expect(r.map((x) => x.delegateId)).toEqual(['b', 'a']);
    expect(r.map((x) => x.rank)).toEqual([1, 1]);
  });
  it('shares ranks on equal totals (1,2,2,4)', () => {
    const r = rankDelegates(
      [d('a', 'A'), d('b', 'B'), d('c', 'C'), d('d', 'D')],
      [mk('a', 'gsl_speech', 3), mk('b', 'gsl_speech', 1), mk('c', 'gsl_speech', 1)],
      DEFAULT_SCORING,
    );
    expect(r.map((x) => x.rank)).toEqual([1, 2, 2, 4]);
    expect(r[3].total).toBe(0);
  });
});
