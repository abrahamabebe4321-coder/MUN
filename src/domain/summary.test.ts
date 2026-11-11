import { describe, expect, it } from 'vitest';
import { reducer } from '../state/reducer';
import type { Action } from '../state/reducer';
import { createCommittee } from '../state/state';
import type { CommitteeState } from '../state/state';
import type { InteractionKind, Tier } from './types';
import { buildSummary, csvEscape, summaryCsv } from './summary';

function build(actions: Action[]): CommitteeState {
  return actions.reduce(reducer, createCommittee());
}

const dels: Action[] = [
  { type: 'delegate/add', id: 'a', name: 'Alpha', flag: 'et' },
  { type: 'delegate/add', id: 'b', name: 'Bravo', flag: 'ke' },
  { type: 'delegate/add', id: 'c', name: 'Charlie', flag: 'us' },
  { type: 'delegate/add', id: 'd', name: 'Delta', flag: null },
];

let t = 0;
function add(delegateId: string, kind: InteractionKind, tier: Tier = 1, note = ''): Action {
  return { type: 'interaction/add', delegateId, kind, tier, note, now: ++t };
}

describe('buildSummary', () => {
  it('awards best/outstanding/honourable by rank and omits zero scorers', () => {
    const s = buildSummary(
      build([
        ...dels,
        add('a', 'gsl_speech', 3), // 18
        add('b', 'gsl_speech', 2), // 12
        add('c', 'gsl_speech', 1), // 6
      ]),
    );
    const titles = s.awards.map((a) => a.title);
    expect(titles.slice(0, 3)).toEqual(['Best Delegate', 'Outstanding Delegate', 'Honourable Mention']);
    expect(s.awards[0].delegateIds).toEqual(['a']);
    expect(s.awards[1].delegateIds).toEqual(['b']);
    expect(s.awards[2].delegateIds).toEqual(['c']);
    expect(s.awards.find((a) => a.title === 'Best Speaker')?.delegateIds).toEqual(['a']);
    expect(s.awards.find((a) => a.title === 'Best Questioner')).toBeUndefined();
    expect(s.awards.find((a) => a.title === 'Best Resolution Work')).toBeUndefined();
  });

  it('lists tied delegates and omits the following rank', () => {
    const s = buildSummary(
      build([...dels, add('a', 'gsl_speech', 2), add('b', 'gsl_speech', 2), add('c', 'gsl_speech', 1)]),
    );
    const best = s.awards.find((a) => a.title === 'Best Delegate');
    expect(best?.delegateIds.sort()).toEqual(['a', 'b']);
    expect(s.awards.find((a) => a.title === 'Outstanding Delegate')).toBeUndefined();
    expect(s.awards.find((a) => a.title === 'Honourable Mention')?.delegateIds).toEqual(['c']);
  });

  it('gives no awards when nobody has positive points', () => {
    expect(buildSummary(build(dels)).awards).toEqual([]);
    expect(buildSummary(build([...dels, add('a', 'penalty')])).awards).toEqual([]);
  });

  it('gives category awards to the highest positive scorer(s)', () => {
    const s = buildSummary(
      build([
        ...dels,
        add('a', 'gsl_speech', 1), // speeches 6
        add('b', 'poi_asked', 3), // pois 6
        add('c', 'poi_asked', 3), // pois 6
        { type: 'resolution/add', name: 'R1', sponsorIds: ['d'] }, // resolutions 5
      ]),
    );
    expect(s.awards.find((a) => a.title === 'Best Speaker')?.delegateIds).toEqual(['a']);
    expect(s.awards.find((a) => a.title === 'Best Questioner')?.delegateIds.sort()).toEqual(['b', 'c']);
    expect(s.awards.find((a) => a.title === 'Best Resolution Work')?.delegateIds).toEqual(['d']);
  });

  it('orders kinds by points then label, and counts them', () => {
    const s = buildSummary(
      build([
        ...dels,
        add('a', 'gsl_speech', 1), // 6
        add('a', 'gsl_speech', 2), // 12
        add('a', 'poi_asked', 3), // 6
        add('a', 'penalty'), // -2
      ]),
    );
    const a = s.delegates.find((d) => d.delegateId === 'a')!;
    expect(a.flag).toBe('et');
    expect(a.kinds.map((k) => [k.label, k.count, k.points])).toEqual([
      ['GSL speech', 2, 18],
      ['POI asked', 1, 6],
      ['Penalty', 1, -2],
    ]);
    const tie = buildSummary(build([...dels, add('a', 'gsl_speech', 1), add('a', 'poi_asked', 3)]));
    expect(tie.delegates[0].kinds.map((k) => k.label)).toEqual(['GSL speech', 'POI asked']);
  });

  it('keeps non-empty notes oldest first and excludes synthetic entries', () => {
    const s = buildSummary(
      build([
        ...dels,
        add('a', 'gsl_speech', 1, 'Strong opener'),
        add('a', 'poi_asked', 1, ''),
        add('a', 'poi_answer', 1, 'Witty'),
        { type: 'resolution/add', name: 'Water Pact', sponsorIds: ['a'] },
      ]),
    );
    const a = s.delegates.find((d) => d.delegateId === 'a')!;
    expect(a.notes).toEqual(['GSL speech: Strong opener', 'POI answer: Witty']);
    expect(a.kinds.some((k) => k.kind === 'sponsor')).toBe(true);
  });

  it('computes stats', () => {
    let st = build([
      ...dels,
      add('a', 'opening_speech'),
      add('b', 'amendment_speech'),
      add('c', 'poi_asked'),
      add('c', 'poi_asked'),
      add('c', 'poi_answer'),
      { type: 'motion/add', motionType: 'gsl', proposerId: 'a' },
      { type: 'motion/add', motionType: 'unmod', proposerId: 'b' },
      { type: 'motion/add', motionType: 'mod', proposerId: 'b' },
      { type: 'resolution/add', name: 'R1' },
      { type: 'resolution/add', name: 'R2' },
      { type: 'vote/record', subject: 'x', procedural: true, threshold: 'simple', counts: { for: 2, against: 1, abstain: 0 }, now: 1 },
      { type: 'session/next' },
    ]);
    st = {
      ...st,
      motions: st.motions.map((m, i) => ({ ...m, status: i === 0 ? 'passed' : i === 1 ? 'failed' : 'pending' })),
      resolutions: st.resolutions.map((r, i) => ({ ...r, status: i === 0 ? 'passed' : 'draft' })),
    };
    expect(buildSummary(st).stats).toEqual({
      sessions: 2,
      delegates: 4,
      speeches: 2,
      pois: 2,
      motionsPassed: 1,
      motionsFailed: 1,
      votes: 1,
      resolutionsPassed: 1,
      resolutionsTotal: 2,
      interactions: 5,
    });
  });
});

describe('csv', () => {
  it('escapes values', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape(5)).toBe('5');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('x\ny')).toBe('"x\ny"');
  });

  it('writes header and rows in rank order', () => {
    const st = build([
      { type: 'delegate/add', id: 'a', name: 'Alpha', flag: 'et' },
      { type: 'delegate/add', id: 'custom-1', name: 'Group "A", West', flag: null },
      add('custom-1', 'gsl_speech', 3),
      add('a', 'poi_asked', 1),
    ]);
    const lines = summaryCsv(st).split('\r\n');
    expect(lines[0]).toBe(
      'Rank,Delegate,Total,Speeches,POIs,Motions & points,Resolution work,Conduct,Insightful,Decent,Works,Entries',
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('1,"Group ""A"", West",18,18,0,0,0,0,1,0,0,1');
    expect(lines[2]).toBe('2,Alpha,2,0,2,0,0,0,0,0,1,1');
  });
});
