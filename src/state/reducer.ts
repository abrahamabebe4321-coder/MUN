import { tally } from '../domain/voting';
import { addTime, createTimer, isRunning, pause, reset, setDuration, start, toggle } from '../domain/timer';
import type { TimerState } from '../domain/timer';
import type {
  AmendmentStatus,
  Attendance,
  Interaction,
  InteractionKind,
  MotionStatus,
  MotionType,
  Resolution,
  ScoringConfig,
  Threshold,
  Tier,
  VoteChoice,
} from '../domain/types';
import { idleDebate } from './state';
import type { CommitteeState, DebateMode, DebateState, Stage } from './state';

export type Action =
  | { type: 'committee/update'; name?: string; topic?: string }
  | { type: 'committee/setStage'; stage: Stage }
  | { type: 'session/next' }
  | { type: 'delegate/add'; id?: string; name: string; flag: string | null }
  | { type: 'delegate/remove'; id: string }
  | { type: 'attendance/set'; id: string; attendance: Attendance }
  | { type: 'attendance/setAll'; attendance: Attendance }
  | {
      type: 'interaction/add';
      delegateId: string;
      kind: InteractionKind;
      tier: Tier;
      passed?: boolean;
      note?: string;
      refId?: string;
      now: number;
    }
  | {
      type: 'interaction/update';
      id: string;
      patch: Partial<Pick<Interaction, 'kind' | 'tier' | 'passed' | 'note' | 'delegateId'>>;
    }
  | { type: 'interaction/remove'; id: string }
  | { type: 'scoring/set'; scoring: ScoringConfig }
  | {
      type: 'motion/add';
      motionType: MotionType;
      proposerId: string;
      topic?: string;
      totalSeconds?: number;
      speakerSeconds?: number;
    }
  | { type: 'motion/setStatus'; id: string; status: MotionStatus }
  | { type: 'motion/remove'; id: string }
  | { type: 'motion/clearPending' }
  | {
      type: 'vote/record';
      subject: string;
      procedural: boolean;
      threshold: Threshold;
      counts: { for: number; against: number; abstain: number };
      ballots?: Record<string, VoteChoice> | null;
      now: number;
    }
  | { type: 'vote/remove'; id: string }
  | {
      type: 'debate/start';
      mode: Exclude<DebateMode, 'none'>;
      topic?: string;
      totalSeconds?: number;
      speakerSeconds?: number;
      resolutionId?: string | null;
    }
  | { type: 'debate/end' }
  | { type: 'speakers/add'; id: string }
  | { type: 'speakers/remove'; id: string }
  | { type: 'speakers/move'; id: string; direction: -1 | 1 }
  | { type: 'speakers/next' }
  | { type: 'speakers/setCurrent'; id: string | null }
  | {
      type: 'timer';
      which: 'speech' | 'caucus' | 'both';
      op: 'start' | 'pause' | 'toggle' | 'reset' | 'add' | 'set';
      seconds?: number;
      now: number;
    }
  | { type: 'resolution/add'; name: string; sponsorIds?: string[]; signatoryIds?: string[] }
  | {
      type: 'resolution/update';
      id: string;
      patch: Partial<Pick<Resolution, 'name' | 'sponsorIds' | 'signatoryIds' | 'status'>>;
    }
  | { type: 'resolution/remove'; id: string }
  | { type: 'amendment/add'; resolutionId: string; proposerId: string; description: string }
  | { type: 'amendment/setStatus'; resolutionId: string; id: string; status: AmendmentStatus }
  | { type: 'amendment/remove'; resolutionId: string; id: string }
  | { type: 'state/replace'; state: CommitteeState }
  | { type: 'batch'; actions: Action[] };

/** The id the next minting action will receive for the given prefix. */
export function peekId(state: CommitteeState, prefix: string): string {
  return `${prefix}${state.nextId}`;
}

const hasDelegate = (s: CommitteeState, id: string) => s.delegates.some((d) => d.id === id);

function setPassedByRef(list: Interaction[], refId: string, passed: boolean): Interaction[] {
  return list.map((i) => (i.refId === refId && i.passed !== passed ? { ...i, passed } : i));
}

function applyTimer(
  t: TimerState,
  op: 'start' | 'pause' | 'toggle' | 'reset' | 'add' | 'set',
  seconds: number | undefined,
  now: number,
): TimerState {
  switch (op) {
    case 'start':
      return start(t, now);
    case 'pause':
      return pause(t, now);
    case 'toggle':
      return toggle(t, now);
    case 'reset':
      return reset(t);
    case 'add':
      return addTime(t, seconds ?? 0);
    case 'set':
      return reset(setDuration(t, seconds ?? 0));
  }
}

/** Finish the current speaker and make `nextId` current (removing them from the queue). */
function advanceSpeaker(debate: DebateState, nextId: string | null): DebateState {
  const spoken =
    debate.currentSpeakerId !== null ? [...debate.spoken, debate.currentSpeakerId] : debate.spoken;
  return {
    ...debate,
    spoken,
    currentSpeakerId: nextId,
    speakersList: debate.speakersList.filter((x) => x !== nextId),
    speechTimer: createTimer(debate.speakerSeconds),
  };
}

function changeSpeaker(state: CommitteeState, nextSpeakerId: string | null): CommitteeState {
  const debate = advanceSpeaker(state.debate, nextSpeakerId);
  if (nextSpeakerId === null) return { ...state, debate: { ...debate, speechRef: null } };
  return {
    ...state,
    debate: { ...debate, speechRef: `s${state.nextId}` },
    nextId: state.nextId + 1,
  };
}

export function reducer(state: CommitteeState, action: Action): CommitteeState {
  switch (action.type) {
    case 'committee/update':
      return {
        ...state,
        name: action.name ?? state.name,
        topic: action.topic ?? state.topic,
      };

    case 'committee/setStage':
      return { ...state, stage: action.stage };

    case 'session/next':
      return {
        ...state,
        session: state.session + 1,
        debate: idleDebate(state.debate.speakerSeconds),
        delegates: state.delegates.map((d) =>
          d.attendance === 'absent' ? d : { ...d, attendance: 'absent' },
        ),
        motions: state.motions.map((m) =>
          m.status === 'pending' ? { ...m, status: 'withdrawn' } : m,
        ),
      };

    case 'delegate/add': {
      const id = action.id ?? `custom-${state.nextId}`;
      if (hasDelegate(state, id)) return state;
      const delegates = [
        ...state.delegates,
        { id, name: action.name, flag: action.flag, attendance: 'absent' as Attendance },
      ].sort((a, b) => a.name.localeCompare(b.name));
      return {
        ...state,
        delegates,
        nextId: action.id === undefined ? state.nextId + 1 : state.nextId,
      };
    }

    case 'delegate/remove': {
      if (!hasDelegate(state, action.id)) return state;
      const id = action.id;
      const d = state.debate;
      return {
        ...state,
        delegates: state.delegates.filter((x) => x.id !== id),
        interactions: state.interactions.filter((i) => i.delegateId !== id),
        resolutions: state.resolutions.map((r) => ({
          ...r,
          sponsorIds: r.sponsorIds.filter((x) => x !== id),
          signatoryIds: r.signatoryIds.filter((x) => x !== id),
        })),
        debate: {
          ...d,
          speakersList: d.speakersList.filter((x) => x !== id),
          spoken: d.spoken.filter((x) => x !== id),
          currentSpeakerId: d.currentSpeakerId === id ? null : d.currentSpeakerId,
          speechRef: d.currentSpeakerId === id ? null : d.speechRef,
        },
      };
    }

    case 'attendance/set': {
      if (!hasDelegate(state, action.id)) return state;
      return {
        ...state,
        delegates: state.delegates.map((d) =>
          d.id === action.id ? { ...d, attendance: action.attendance } : d,
        ),
      };
    }

    case 'attendance/setAll':
      return {
        ...state,
        delegates: state.delegates.map((d) => ({ ...d, attendance: action.attendance })),
      };

    case 'interaction/add': {
      if (!hasDelegate(state, action.delegateId)) return state;
      const interaction: Interaction = {
        id: `i${state.nextId}`,
        delegateId: action.delegateId,
        kind: action.kind,
        tier: action.tier,
        passed: action.passed ?? false,
        note: action.note ?? '',
        session: state.session,
        timestamp: action.now,
      };
      if (action.refId !== undefined) interaction.refId = action.refId;
      return {
        ...state,
        interactions: [...state.interactions, interaction],
        nextId: state.nextId + 1,
      };
    }

    case 'interaction/update': {
      if (!state.interactions.some((i) => i.id === action.id)) return state;
      if (action.patch.delegateId !== undefined && !hasDelegate(state, action.patch.delegateId)) {
        return state;
      }
      return {
        ...state,
        interactions: state.interactions.map((i) =>
          i.id === action.id ? { ...i, ...action.patch } : i,
        ),
      };
    }

    case 'interaction/remove': {
      if (!state.interactions.some((i) => i.id === action.id)) return state;
      return { ...state, interactions: state.interactions.filter((i) => i.id !== action.id) };
    }

    case 'scoring/set':
      return { ...state, scoring: action.scoring };

    case 'motion/add': {
      if (!hasDelegate(state, action.proposerId)) return state;
      return {
        ...state,
        motions: [
          ...state.motions,
          {
            id: `m${state.nextId}`,
            type: action.motionType,
            proposerId: action.proposerId,
            topic: action.topic ?? '',
            totalSeconds: action.totalSeconds ?? 0,
            speakerSeconds: action.speakerSeconds ?? 0,
            status: 'pending',
            raisedOrder: state.nextId,
            session: state.session,
          },
        ],
        nextId: state.nextId + 1,
      };
    }

    case 'motion/setStatus': {
      if (!state.motions.some((m) => m.id === action.id)) return state;
      return {
        ...state,
        motions: state.motions.map((m) => (m.id === action.id ? { ...m, status: action.status } : m)),
        interactions: setPassedByRef(state.interactions, action.id, action.status === 'passed'),
      };
    }

    case 'motion/remove': {
      if (!state.motions.some((m) => m.id === action.id)) return state;
      return {
        ...state,
        motions: state.motions.filter((m) => m.id !== action.id),
        interactions: state.interactions.filter((i) => i.refId !== action.id),
      };
    }

    case 'motion/clearPending': {
      if (!state.motions.some((m) => m.status === 'pending')) return state;
      return {
        ...state,
        motions: state.motions.map((m) =>
          m.status === 'pending' ? { ...m, status: 'withdrawn' } : m,
        ),
      };
    }

    case 'vote/record':
      return {
        ...state,
        votes: [
          ...state.votes,
          {
            id: `v${state.nextId}`,
            subject: action.subject,
            procedural: action.procedural,
            threshold: action.threshold,
            for: action.counts.for,
            against: action.counts.against,
            abstain: action.counts.abstain,
            ballots: action.ballots ?? null,
            passed: tally(action.counts, action.threshold).passed,
            session: state.session,
            timestamp: action.now,
          },
        ],
        nextId: state.nextId + 1,
      };

    case 'vote/remove': {
      if (!state.votes.some((v) => v.id === action.id)) return state;
      return { ...state, votes: state.votes.filter((v) => v.id !== action.id) };
    }

    case 'debate/start': {
      const speakerSeconds = action.speakerSeconds ?? state.debate.speakerSeconds;
      const caucus = action.mode === 'mod' || action.mode === 'unmod';
      return {
        ...state,
        debate: {
          mode: action.mode,
          topic: action.topic ?? '',
          speakerSeconds,
          caucusTimer: caucus ? createTimer(action.totalSeconds ?? 600) : null,
          speechTimer: createTimer(speakerSeconds),
          speakersList: [],
          currentSpeakerId: null,
          spoken: [],
          resolutionId: action.resolutionId ?? null,
          speechRef: null,
        },
      };
    }

    case 'debate/end':
      return { ...state, debate: idleDebate(state.debate.speakerSeconds) };

    case 'speakers/add': {
      const d = state.debate;
      if (
        !hasDelegate(state, action.id) ||
        d.speakersList.includes(action.id) ||
        d.currentSpeakerId === action.id
      ) {
        return state;
      }
      return { ...state, debate: { ...d, speakersList: [...d.speakersList, action.id] } };
    }

    case 'speakers/remove': {
      const d = state.debate;
      if (!d.speakersList.includes(action.id)) return state;
      return {
        ...state,
        debate: { ...d, speakersList: d.speakersList.filter((x) => x !== action.id) },
      };
    }

    case 'speakers/move': {
      const d = state.debate;
      const idx = d.speakersList.indexOf(action.id);
      const to = idx + action.direction;
      if (idx < 0 || to < 0 || to >= d.speakersList.length) return state;
      const list = [...d.speakersList];
      [list[idx], list[to]] = [list[to], list[idx]];
      return { ...state, debate: { ...d, speakersList: list } };
    }

    case 'speakers/next':
      return changeSpeaker(state, state.debate.speakersList[0] ?? null);

    case 'speakers/setCurrent': {
      if (action.id !== null && !hasDelegate(state, action.id)) return state;
      return changeSpeaker(state, action.id);
    }

    case 'timer': {
      const d = state.debate;
      if (action.which === 'caucus') {
        if (d.caucusTimer === null) return state;
        return {
          ...state,
          debate: { ...d, caucusTimer: applyTimer(d.caucusTimer, action.op, action.seconds, action.now) },
        };
      }
      if (action.which === 'both') {
        const { op, now } = action;
        if (op !== 'start' && op !== 'pause' && op !== 'toggle') return state;
        const pausing = op === 'pause' || (op === 'toggle' && isRunning(d.speechTimer));
        const f = pausing ? pause : start;
        return {
          ...state,
          debate: {
            ...d,
            speechTimer: f(d.speechTimer, now),
            caucusTimer: d.caucusTimer === null ? null : f(d.caucusTimer, now),
          },
        };
      }
      const speechTimer = applyTimer(d.speechTimer, action.op, action.seconds, action.now);
      return {
        ...state,
        debate: {
          ...d,
          speechTimer,
          speakerSeconds:
            action.op === 'set' ? (action.seconds ?? d.speakerSeconds) : d.speakerSeconds,
        },
      };
    }

    case 'resolution/add':
      return {
        ...state,
        resolutions: [
          ...state.resolutions,
          {
            id: `r${state.nextId}`,
            name: action.name,
            sponsorIds: action.sponsorIds ?? [],
            signatoryIds: action.signatoryIds ?? [],
            amendments: [],
            status: 'draft',
          },
        ],
        nextId: state.nextId + 1,
      };

    case 'resolution/update': {
      const res = state.resolutions.find((r) => r.id === action.id);
      if (!res) return state;
      const next: Resolution = { ...res, ...action.patch };
      if (action.patch.sponsorIds !== undefined || action.patch.signatoryIds !== undefined) {
        next.signatoryIds = next.signatoryIds.filter((x) => !next.sponsorIds.includes(x));
      }
      return {
        ...state,
        resolutions: state.resolutions.map((r) => (r.id === action.id ? next : r)),
      };
    }

    case 'resolution/remove': {
      const res = state.resolutions.find((r) => r.id === action.id);
      if (!res) return state;
      const amendmentIds = new Set(res.amendments.map((a) => a.id));
      return {
        ...state,
        resolutions: state.resolutions.filter((r) => r.id !== action.id),
        interactions: state.interactions.filter(
          (i) => i.refId === undefined || !amendmentIds.has(i.refId),
        ),
        debate:
          state.debate.resolutionId === action.id
            ? { ...state.debate, resolutionId: null }
            : state.debate,
      };
    }

    case 'amendment/add': {
      if (
        !state.resolutions.some((r) => r.id === action.resolutionId) ||
        !hasDelegate(state, action.proposerId)
      ) {
        return state;
      }
      const id = `a${state.nextId}`;
      return {
        ...state,
        resolutions: state.resolutions.map((r) =>
          r.id === action.resolutionId
            ? {
                ...r,
                amendments: [
                  ...r.amendments,
                  {
                    id,
                    proposerId: action.proposerId,
                    description: action.description,
                    status: 'pending',
                  },
                ],
              }
            : r,
        ),
        nextId: state.nextId + 1,
      };
    }

    case 'amendment/setStatus': {
      const res = state.resolutions.find((r) => r.id === action.resolutionId);
      if (!res || !res.amendments.some((a) => a.id === action.id)) return state;
      return {
        ...state,
        resolutions: state.resolutions.map((r) =>
          r.id === action.resolutionId
            ? {
                ...r,
                amendments: r.amendments.map((a) =>
                  a.id === action.id ? { ...a, status: action.status } : a,
                ),
              }
            : r,
        ),
        interactions: setPassedByRef(state.interactions, action.id, action.status === 'passed'),
      };
    }

    case 'amendment/remove': {
      const res = state.resolutions.find((r) => r.id === action.resolutionId);
      if (!res || !res.amendments.some((a) => a.id === action.id)) return state;
      return {
        ...state,
        resolutions: state.resolutions.map((r) =>
          r.id === action.resolutionId
            ? { ...r, amendments: r.amendments.filter((a) => a.id !== action.id) }
            : r,
        ),
        interactions: state.interactions.filter((i) => i.refId !== action.id),
      };
    }

    case 'state/replace':
      return action.state;

    case 'batch': {
      let s = state;
      for (const a of action.actions) s = reducer(s, a);
      return s;
    }
  }
}
