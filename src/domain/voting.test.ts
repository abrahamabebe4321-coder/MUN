import { describe, expect, it } from 'vitest';
import {
  canAbstain,
  countBallots,
  eligibleVoters,
  quorum,
  requiredVotes,
  tally,
  validateCounts,
} from './voting';
import type { Attendance, Delegate } from './types';

const del = (id: string, attendance: Attendance): Delegate => ({
  id,
  name: id,
  flag: null,
  attendance,
});

describe('requiredVotes', () => {
  it('simple majority', () => {
    expect(requiredVotes('simple', 10)).toBe(6);
    expect(requiredVotes('simple', 11)).toBe(6);
  });
  it('two thirds', () => {
    expect(requiredVotes('two_thirds', 10)).toBe(7);
    expect(requiredVotes('two_thirds', 9)).toBe(6);
    expect(requiredVotes('two_thirds', 12)).toBe(8);
  });
  it('returns 1 for zero votes', () => {
    expect(requiredVotes('simple', 0)).toBe(1);
    expect(requiredVotes('two_thirds', 0)).toBe(1);
  });
});

describe('tally', () => {
  it('passes with a majority', () => {
    const r = tally({ for: 6, against: 4, abstain: 0 }, 'simple');
    expect(r).toEqual({ for: 6, against: 4, abstain: 0, cast: 10, required: 6, passed: true });
  });
  it('fails on a tie', () => {
    expect(tally({ for: 5, against: 5, abstain: 0 }, 'simple').passed).toBe(false);
  });
  it('fails with zero votes', () => {
    expect(tally({ for: 0, against: 0, abstain: 3 }, 'simple').passed).toBe(false);
  });
  it('abstentions do not change required', () => {
    const a = tally({ for: 6, against: 4, abstain: 0 }, 'simple');
    const b = tally({ for: 6, against: 4, abstain: 50 }, 'simple');
    expect(b.required).toBe(a.required);
    expect(b.cast).toBe(10);
  });
  it('two thirds threshold', () => {
    expect(tally({ for: 6, against: 3, abstain: 0 }, 'two_thirds').passed).toBe(true);
    expect(tally({ for: 5, against: 4, abstain: 0 }, 'two_thirds').passed).toBe(false);
  });
});

describe('countBallots', () => {
  it('counts each choice', () => {
    expect(countBallots({ a: 'for', b: 'for', c: 'against', d: 'abstain' })).toEqual({
      for: 2,
      against: 1,
      abstain: 1,
    });
  });
  it('handles empty', () => {
    expect(countBallots({})).toEqual({ for: 0, against: 0, abstain: 0 });
  });
});

describe('eligibleVoters', () => {
  it('excludes absent delegates', () => {
    const ds = [del('a', 'absent'), del('b', 'present'), del('c', 'present_voting')];
    expect(eligibleVoters(ds).map((d) => d.id)).toEqual(['b', 'c']);
  });
});

describe('canAbstain', () => {
  const cases: [Attendance, boolean, boolean][] = [
    ['present', false, true],
    ['present', true, false],
    ['present_voting', false, false],
    ['present_voting', true, false],
    ['absent', false, false],
    ['absent', true, false],
  ];
  it.each(cases)('%s procedural=%s -> %s', (att, proc, expected) => {
    expect(canAbstain(del('x', att), proc)).toBe(expected);
  });
});

describe('quorum', () => {
  it('computes numbers', () => {
    const ds = [
      ...Array.from({ length: 4 }, (_, i) => del(`p${i}`, 'present')),
      ...Array.from({ length: 6 }, (_, i) => del(`v${i}`, 'present_voting')),
      ...Array.from({ length: 5 }, (_, i) => del(`a${i}`, 'absent')),
    ];
    expect(quorum(ds)).toEqual({
      total: 15,
      present: 10,
      presentVoting: 6,
      absent: 5,
      simpleMajority: 6,
      twoThirds: 7,
      hasQuorum: true,
    });
  });
  it('quorum threshold is one third rounded up', () => {
    const mk = (present: number, total: number) => [
      ...Array.from({ length: present }, (_, i) => del(`p${i}`, 'present')),
      ...Array.from({ length: total - present }, (_, i) => del(`a${i}`, 'absent')),
    ];
    expect(quorum(mk(4, 10)).hasQuorum).toBe(true);
    expect(quorum(mk(3, 10)).hasQuorum).toBe(false);
  });
  it('no quorum when nobody present or no delegates', () => {
    expect(quorum([]).hasQuorum).toBe(false);
    expect(quorum([del('a', 'absent')]).hasQuorum).toBe(false);
  });
});

describe('validateCounts', () => {
  it('accepts valid counts', () => {
    expect(validateCounts({ for: 3, against: 2, abstain: 1 }, 6, false)).toBeNull();
  });
  it('rejects negative', () => {
    expect(validateCounts({ for: -1, against: 0, abstain: 0 }, 5, false)).toBe(
      'Counts must be whole numbers of 0 or more',
    );
  });
  it('rejects non-integer', () => {
    expect(validateCounts({ for: 1.5, against: 0, abstain: 0 }, 5, false)).toBe(
      'Counts must be whole numbers of 0 or more',
    );
  });
  it('rejects abstentions on procedural votes', () => {
    expect(validateCounts({ for: 1, against: 0, abstain: 1 }, 5, true)).toBe(
      'Abstentions are not allowed on procedural votes',
    );
  });
  it('rejects sum above eligible', () => {
    expect(validateCounts({ for: 4, against: 2, abstain: 1 }, 6, false)).toBe(
      'Total votes (7) exceed delegates present (6)',
    );
  });
});
