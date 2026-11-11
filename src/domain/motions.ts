import type { Motion, MotionType } from './types';

export const MOTION_LABELS: Record<MotionType, string> = {
  unmod: 'Unmoderated caucus',
  mod: 'Moderated caucus',
  gsl: 'General speakers list',
  roll_call: 'Roll call',
  set_agenda: 'Set the agenda',
  commence_debate: 'Commence debate',
  present_resolutions: 'Present resolutions',
  extend: 'Extend current caucus',
  adjourn: 'Adjourn / suspend',
  other: 'Other',
};

/** Most disruptive first. */
export const MOTION_PRECEDENCE: MotionType[] = [
  'adjourn',
  'unmod',
  'mod',
  'gsl',
  'extend',
  'present_resolutions',
  'set_agenda',
  'commence_debate',
  'roll_call',
  'other',
];

function speakerCount(m: Motion): number {
  return m.speakerSeconds > 0 ? Math.floor(m.totalSeconds / m.speakerSeconds) : 0;
}

export function compareMotions(a: Motion, b: Motion): number {
  const pa = MOTION_PRECEDENCE.indexOf(a.type);
  const pb = MOTION_PRECEDENCE.indexOf(b.type);
  if (pa !== pb) return pa - pb;
  if (a.totalSeconds !== b.totalSeconds) return b.totalSeconds - a.totalSeconds;
  if (a.type === 'mod') {
    const sa = speakerCount(a);
    const sb = speakerCount(b);
    if (sa !== sb) return sb - sa;
  } else if (a.type === 'gsl') {
    if (a.speakerSeconds !== b.speakerSeconds) return b.speakerSeconds - a.speakerSeconds;
  }
  return a.raisedOrder - b.raisedOrder;
}

export function orderMotions(motions: Motion[]): Motion[] {
  return motions.filter((m) => m.status === 'pending').sort(compareMotions);
}

export function motionNeeds(type: MotionType): {
  topic: boolean;
  totalTime: boolean;
  speakerTime: boolean;
} {
  switch (type) {
    case 'mod':
      return { topic: true, totalTime: true, speakerTime: true };
    case 'unmod':
    case 'extend':
      return { topic: false, totalTime: true, speakerTime: false };
    case 'gsl':
      return { topic: false, totalTime: false, speakerTime: true };
    case 'set_agenda':
    case 'other':
      return { topic: true, totalTime: false, speakerTime: false };
    default:
      return { topic: false, totalTime: false, speakerTime: false };
  }
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function describeMotion(m: Motion): string {
  const label = MOTION_LABELS[m.type];
  switch (m.type) {
    case 'mod':
      return `${label} on "${m.topic}" (${fmt(m.totalSeconds)} total, ${fmt(m.speakerSeconds)} per speaker)`;
    case 'unmod':
    case 'extend':
      return `${label} (${fmt(m.totalSeconds)})`;
    case 'gsl':
      return `${label} (${fmt(m.speakerSeconds)} per speaker)`;
    case 'set_agenda':
      return `${label} on "${m.topic}"`;
    case 'other':
      return m.topic ? m.topic : label;
    default:
      return label;
  }
}
