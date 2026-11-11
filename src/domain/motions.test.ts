import { describe, expect, it } from 'vitest';
import {
  MOTION_LABELS,
  MOTION_PRECEDENCE,
  compareMotions,
  describeMotion,
  motionNeeds,
  orderMotions,
} from './motions';
import type { Motion } from './types';

let n = 0;
const mk = (over: Partial<Motion>): Motion => ({
  id: `m${n++}`,
  type: 'other',
  proposerId: 'us',
  topic: '',
  totalSeconds: 0,
  speakerSeconds: 0,
  status: 'pending',
  raisedOrder: 0,
  session: 1,
  ...over,
});

describe('labels and precedence', () => {
  it('has a label for every precedence entry', () => {
    expect(MOTION_PRECEDENCE).toHaveLength(10);
    for (const t of MOTION_PRECEDENCE) expect(MOTION_LABELS[t]).toBeTruthy();
    expect(MOTION_LABELS.adjourn).toBe('Adjourn / suspend');
  });
});

describe('orderMotions', () => {
  it('puts unmod before mod', () => {
    const mod = mk({ id: 'mod', type: 'mod', totalSeconds: 600, speakerSeconds: 60 });
    const unmod = mk({ id: 'unmod', type: 'unmod', totalSeconds: 300 });
    expect(orderMotions([mod, unmod]).map((m) => m.id)).toEqual(['unmod', 'mod']);
  });
  it('puts adjourn first', () => {
    const a = mk({ id: 'a', type: 'adjourn' });
    const u = mk({ id: 'u', type: 'unmod', totalSeconds: 900 });
    expect(orderMotions([u, a]).map((m) => m.id)).toEqual(['a', 'u']);
  });
  it('longer unmod first', () => {
    const s = mk({ id: 's', type: 'unmod', totalSeconds: 300 });
    const l = mk({ id: 'l', type: 'unmod', totalSeconds: 900 });
    expect(orderMotions([s, l]).map((m) => m.id)).toEqual(['l', 's']);
  });
  it('among equal-length mods, more speakers first', () => {
    const few = mk({ id: 'few', type: 'mod', totalSeconds: 600, speakerSeconds: 120 });
    const many = mk({ id: 'many', type: 'mod', totalSeconds: 600, speakerSeconds: 30 });
    expect(orderMotions([few, many]).map((m) => m.id)).toEqual(['many', 'few']);
  });
  it('longer mod beats more speakers', () => {
    const long = mk({ id: 'long', type: 'mod', totalSeconds: 900, speakerSeconds: 300 });
    const short = mk({ id: 'short', type: 'mod', totalSeconds: 600, speakerSeconds: 30 });
    expect(orderMotions([short, long]).map((m) => m.id)).toEqual(['long', 'short']);
  });
  it('gsl: longer speaker time first', () => {
    const a = mk({ id: 'a', type: 'gsl', speakerSeconds: 60 });
    const b = mk({ id: 'b', type: 'gsl', speakerSeconds: 90 });
    expect(orderMotions([a, b]).map((m) => m.id)).toEqual(['b', 'a']);
  });
  it('raisedOrder is the last tie-break', () => {
    const late = mk({ id: 'late', type: 'mod', totalSeconds: 600, speakerSeconds: 60, raisedOrder: 5 });
    const early = mk({ id: 'early', type: 'mod', totalSeconds: 600, speakerSeconds: 60, raisedOrder: 2 });
    expect(orderMotions([late, early]).map((m) => m.id)).toEqual(['early', 'late']);
    const r2 = mk({ id: 'r2', type: 'roll_call', raisedOrder: 3 });
    const r1 = mk({ id: 'r1', type: 'roll_call', raisedOrder: 1 });
    expect(orderMotions([r2, r1]).map((m) => m.id)).toEqual(['r1', 'r2']);
  });
  it('excludes non-pending motions', () => {
    const ms = [
      mk({ id: 'p', type: 'unmod', totalSeconds: 60 }),
      mk({ id: 'x', type: 'unmod', status: 'passed' }),
      mk({ id: 'y', type: 'unmod', status: 'failed' }),
      mk({ id: 'z', type: 'unmod', status: 'withdrawn' }),
    ];
    expect(orderMotions(ms).map((m) => m.id)).toEqual(['p']);
  });
  it('does not mutate the input', () => {
    const a = mk({ id: 'a', type: 'mod', totalSeconds: 60, speakerSeconds: 10 });
    const b = mk({ id: 'b', type: 'unmod', totalSeconds: 60 });
    const c = mk({ id: 'c', type: 'unmod', status: 'passed' });
    const input = [a, b, c];
    orderMotions(input);
    expect(input.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('compareMotions', () => {
  it('returns 0 for identical ordering keys', () => {
    expect(compareMotions(mk({ raisedOrder: 1 }), mk({ raisedOrder: 1 }))).toBe(0);
  });
});

describe('motionNeeds', () => {
  const all = { topic: true, totalTime: true, speakerTime: true };
  const none = { topic: false, totalTime: false, speakerTime: false };
  it('matches the rules', () => {
    expect(motionNeeds('mod')).toEqual(all);
    expect(motionNeeds('unmod')).toEqual({ ...none, totalTime: true });
    expect(motionNeeds('gsl')).toEqual({ ...none, speakerTime: true });
    expect(motionNeeds('set_agenda')).toEqual({ ...none, topic: true });
    expect(motionNeeds('other')).toEqual({ ...none, topic: true });
    expect(motionNeeds('extend')).toEqual({ ...none, totalTime: true });
    for (const t of ['roll_call', 'commence_debate', 'present_resolutions', 'adjourn'] as const) {
      expect(motionNeeds(t)).toEqual(none);
    }
  });
});

describe('describeMotion', () => {
  it('mod', () => {
    expect(
      describeMotion(mk({ type: 'mod', topic: 'Wheat exports', totalSeconds: 600, speakerSeconds: 60 })),
    ).toBe('Moderated caucus on "Wheat exports" — 10:00 total, 1:00 per speaker');
  });
  it('unmod', () => {
    expect(describeMotion(mk({ type: 'unmod', totalSeconds: 900 }))).toBe('Unmoderated caucus — 15:00');
  });
  it('gsl', () => {
    expect(describeMotion(mk({ type: 'gsl', speakerSeconds: 90 }))).toBe(
      'General speakers list — 1:30 per speaker',
    );
  });
  it('set_agenda', () => {
    expect(describeMotion(mk({ type: 'set_agenda', topic: 'Veto reform' }))).toBe(
      'Set the agenda on "Veto reform"',
    );
  });
  it('extend', () => {
    expect(describeMotion(mk({ type: 'extend', totalSeconds: 300 }))).toBe('Extend current caucus — 5:00');
  });
  it('other with and without topic', () => {
    expect(describeMotion(mk({ type: 'other', topic: 'Point of the day' }))).toBe('Point of the day');
    expect(describeMotion(mk({ type: 'other', topic: '' }))).toBe('Other');
  });
  it('others use the label', () => {
    expect(describeMotion(mk({ type: 'roll_call' }))).toBe('Roll call');
    expect(describeMotion(mk({ type: 'adjourn' }))).toBe('Adjourn / suspend');
    expect(describeMotion(mk({ type: 'commence_debate' }))).toBe('Commence debate');
    expect(describeMotion(mk({ type: 'present_resolutions' }))).toBe('Present resolutions');
  });
  it('formats seconds as m:ss', () => {
    expect(describeMotion(mk({ type: 'unmod', totalSeconds: 65 }))).toBe('Unmoderated caucus — 1:05');
  });
});
