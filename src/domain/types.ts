export type Tier = 1 | 2 | 3;

export type InteractionKind =
  | 'opening_speech'
  | 'gsl_speech'
  | 'mod_speech'
  | 'resolution_speech'
  | 'amendment_speech'
  | 'amendment_proposed'
  | 'poi_asked'
  | 'poi_answer'
  | 'follow_up'
  | 'motion_raised'
  | 'point_of_order'
  | 'parliamentary_inquiry'
  | 'personal_privilege'
  | 'unmod_leadership'
  | 'sponsor'
  | 'signatory'
  | 'penalty';

export type Attendance = 'absent' | 'present' | 'present_voting';

export interface Delegate {
  /** Unique id. For countries this is the lowercase ISO 3166-1 alpha-2 code; custom delegations use 'custom-<n>'. */
  id: string;
  name: string;
  /** Lowercase ISO alpha-2 code used for the flag, or null for custom delegations. */
  flag: string | null;
  attendance: Attendance;
}

export interface Interaction {
  id: string;
  delegateId: string;
  kind: InteractionKind;
  /** Quality tier. Ignored for flat kinds (sponsor, signatory, personal_privilege). */
  tier: Tier;
  /** True when the motion/amendment this interaction refers to passed (earns the pass bonus). */
  passed: boolean;
  note: string;
  session: number;
  timestamp: number;
}

export interface ScoringConfig {
  base: Record<InteractionKind, number>;
  tierMultiplier: Record<Tier, number>;
  /** Extra points when `passed` is true, per kind. */
  passBonus: Partial<Record<InteractionKind, number>>;
  /** Kinds that ignore the tier multiplier and always score `base`. */
  flatKinds: InteractionKind[];
}

export type MotionType =
  | 'unmod'
  | 'mod'
  | 'gsl'
  | 'roll_call'
  | 'set_agenda'
  | 'commence_debate'
  | 'present_resolutions'
  | 'extend'
  | 'adjourn'
  | 'other';

export type MotionStatus = 'pending' | 'passed' | 'failed' | 'withdrawn';

export interface Motion {
  id: string;
  type: MotionType;
  proposerId: string;
  /** Topic for mod caucus / agenda, free text for 'other'. */
  topic: string;
  /** Total duration in seconds (mod, unmod, extend). 0 when not applicable. */
  totalSeconds: number;
  /** Individual speaker time in seconds (mod, gsl). 0 when not applicable. */
  speakerSeconds: number;
  status: MotionStatus;
  /** Order in which the motion was raised (ascending). */
  raisedOrder: number;
  session: number;
}

export type VoteChoice = 'for' | 'against' | 'abstain';
export type Threshold = 'simple' | 'two_thirds';

export interface VoteRecord {
  id: string;
  subject: string;
  /** Procedural votes do not allow abstentions. */
  procedural: boolean;
  threshold: Threshold;
  for: number;
  against: number;
  abstain: number;
  /** Per-delegate ballots for roll-call votes; null for quick-count votes. */
  ballots: Record<string, VoteChoice> | null;
  passed: boolean;
  session: number;
  timestamp: number;
}

export type AmendmentStatus = 'pending' | 'passed' | 'failed';

export interface Amendment {
  id: string;
  proposerId: string;
  description: string;
  status: AmendmentStatus;
}

export type ResolutionStatus = 'draft' | 'presented' | 'passed' | 'failed';

export interface Resolution {
  id: string;
  name: string;
  sponsorIds: string[];
  signatoryIds: string[];
  amendments: Amendment[];
  status: ResolutionStatus;
}
