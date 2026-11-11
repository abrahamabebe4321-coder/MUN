import type { Delegate, Threshold, VoteChoice } from './types';

export interface Counts {
  for: number;
  against: number;
  abstain: number;
}

/** votesCast = for + against (abstentions never count). */
export function requiredVotes(threshold: Threshold, votesCast: number): number {
  if (votesCast <= 0) return 1;
  if (threshold === 'simple') return Math.floor(votesCast / 2) + 1;
  return Math.ceil((votesCast * 2) / 3);
}

export interface TallyResult {
  for: number;
  against: number;
  abstain: number;
  cast: number;
  required: number;
  passed: boolean;
}

export function tally(counts: Counts, threshold: Threshold): TallyResult {
  const cast = counts.for + counts.against;
  const required = requiredVotes(threshold, cast);
  return {
    for: counts.for,
    against: counts.against,
    abstain: counts.abstain,
    cast,
    required,
    passed: counts.for >= required,
  };
}

export function countBallots(ballots: Record<string, VoteChoice>): Counts {
  const counts: Counts = { for: 0, against: 0, abstain: 0 };
  for (const choice of Object.values(ballots)) {
    counts[choice] += 1;
  }
  return counts;
}

export function eligibleVoters(delegates: Delegate[]): Delegate[] {
  return delegates.filter((d) => d.attendance !== 'absent');
}

export function canAbstain(delegate: Delegate, procedural: boolean): boolean {
  if (procedural) return false;
  return delegate.attendance === 'present';
}

export interface QuorumInfo {
  total: number;
  present: number;
  presentVoting: number;
  absent: number;
  simpleMajority: number;
  twoThirds: number;
  hasQuorum: boolean;
}

export function quorum(delegates: Delegate[]): QuorumInfo {
  const total = delegates.length;
  const absent = delegates.filter((d) => d.attendance === 'absent').length;
  const present = total - absent;
  const presentVoting = delegates.filter((d) => d.attendance === 'present_voting').length;
  return {
    total,
    present,
    presentVoting,
    absent,
    simpleMajority: requiredVotes('simple', present),
    twoThirds: requiredVotes('two_thirds', present),
    hasQuorum: present >= Math.ceil(total / 3) && present > 0,
  };
}

export function validateCounts(
  counts: Counts,
  eligible: number,
  procedural: boolean,
): string | null {
  const values = [counts.for, counts.against, counts.abstain];
  if (values.some((v) => !Number.isInteger(v) || v < 0)) {
    return 'Counts must be whole numbers of 0 or more';
  }
  if (procedural && counts.abstain > 0) {
    return 'Abstentions are not allowed on procedural votes';
  }
  const sum = counts.for + counts.against + counts.abstain;
  if (sum > eligible) {
    return `Total votes (${sum}) exceed delegates present (${eligible})`;
  }
  return null;
}
