import { DEFAULT_SCORING } from '../domain/scoring';
import { createTimer, type TimerState } from '../domain/timer';
import type {
  Delegate,
  Interaction,
  Motion,
  Resolution,
  ScoringConfig,
  VoteRecord,
} from '../domain/types';

export type DebateMode = 'none' | 'opening' | 'gsl' | 'mod' | 'unmod' | 'resolution';

export interface DebateState {
  mode: DebateMode;
  topic: string;
  /** Individual speaker time in seconds for this mode. */
  speakerSeconds: number;
  /** Total caucus countdown (mod, unmod); null otherwise. */
  caucusTimer: TimerState | null;
  speechTimer: TimerState;
  /** Queue of delegate ids waiting to speak. */
  speakersList: string[];
  currentSpeakerId: string | null;
  /** Delegate ids that have already spoken in this mode, in order. */
  spoken: string[];
  /** Resolution being presented/debated when mode is 'resolution'. */
  resolutionId: string | null;
  /** Unique reference for the current speech; interactions logged during it carry this as refId. Null when nobody has the floor. */
  speechRef: string | null;
}

export type Stage = 'setup' | 'running' | 'ended';

export interface CommitteeState {
  version: 1;
  name: string;
  topic: string;
  stage: Stage;
  session: number;
  delegates: Delegate[];
  interactions: Interaction[];
  motions: Motion[];
  votes: VoteRecord[];
  resolutions: Resolution[];
  scoring: ScoringConfig;
  debate: DebateState;
  nextId: number;
}

export const DEFAULT_SPEAKER_SECONDS = 60;

export function idleDebate(speakerSeconds: number = DEFAULT_SPEAKER_SECONDS): DebateState {
  return {
    mode: 'none',
    topic: '',
    speakerSeconds,
    caucusTimer: null,
    speechTimer: createTimer(speakerSeconds),
    speakersList: [],
    currentSpeakerId: null,
    spoken: [],
    resolutionId: null,
    speechRef: null,
  };
}

export function createCommittee(): CommitteeState {
  return {
    version: 1,
    name: '',
    topic: '',
    stage: 'setup',
    session: 1,
    delegates: [],
    interactions: [],
    motions: [],
    votes: [],
    resolutions: [],
    scoring: JSON.parse(JSON.stringify(DEFAULT_SCORING)) as ScoringConfig,
    debate: idleDebate(),
    nextId: 1,
  };
}
