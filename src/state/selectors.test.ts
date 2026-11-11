import { describe, expect, it } from 'vitest';
import { reducer } from './reducer';
import type { Action } from './reducer';
import { delegateById, derivedInteractions, ranking } from './selectors';
import { createCommittee } from './state';

function build(...actions: Action[]) {
  return actions.reduce(reducer, createCommittee());
}

const base: Action[] = [
  { type: 'delegate/add', id: 'a', name: 'Alpha', flag: null },
  { type: 'delegate/add', id: 'b', name: 'Beta', flag: null },
];

describe('selectors', () => {
  it('derives sponsor and signatory interactions', () => {
    const s = build(...base, { type: 'resolution/add', name: 'Res', sponsorIds: ['a', 'ghost'], signatoryIds: ['b'] });
    const d = derivedInteractions(s);
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ id: 'sponsor:r1:a', kind: 'sponsor', tier: 1, passed: false, note: 'Res', refId: 'r1', session: 1, timestamp: 0 });
    expect(d[1]).toMatchObject({ id: 'signatory:r1:b', kind: 'signatory' });
    expect(s.interactions).toHaveLength(0);
  });

  it('ranking includes sponsor 5 and signatory 1', () => {
    const s = build(
      ...base,
      { type: 'resolution/add', name: 'Res', sponsorIds: ['a'], signatoryIds: ['b'] },
      { type: 'interaction/add', delegateId: 'b', kind: 'gsl_speech', tier: 1, now: 1 },
    );
    const r = ranking(s);
    expect(r.find((x) => x.delegateId === 'a')?.total).toBe(5);
    expect(r.find((x) => x.delegateId === 'b')?.total).toBe(7);
    expect(r[0].delegateId).toBe('b');
  });

  it('delegateById', () => {
    const s = build(...base);
    expect(delegateById(s, 'a')?.name).toBe('Alpha');
    expect(delegateById(s, 'zz')).toBeUndefined();
    expect(delegateById(s, null)).toBeUndefined();
  });
});
