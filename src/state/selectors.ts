import { rankDelegates } from '../domain/scoring';
import type { RankedDelegate } from '../domain/scoring';
import type { Delegate, Interaction } from '../domain/types';
import type { CommitteeState } from './state';

/** Interactions plus synthetic flat interactions for sponsor/signatory resolution work. */
export function derivedInteractions(state: CommitteeState): Interaction[] {
  const known = new Set(state.delegates.map((d) => d.id));
  const out: Interaction[] = [...state.interactions];
  for (const res of state.resolutions) {
    for (const [kind, ids] of [
      ['sponsor', res.sponsorIds],
      ['signatory', res.signatoryIds],
    ] as const) {
      for (const delegateId of ids) {
        if (!known.has(delegateId)) continue;
        out.push({
          id: `${kind}:${res.id}:${delegateId}`,
          delegateId,
          kind,
          tier: 1,
          passed: false,
          note: res.name,
          refId: res.id,
          session: state.session,
          timestamp: 0,
        });
      }
    }
  }
  return out;
}

export function ranking(state: CommitteeState): RankedDelegate[] {
  return rankDelegates(state.delegates, derivedInteractions(state), state.scoring);
}

export function delegateById(state: CommitteeState, id: string | null): Delegate | undefined {
  if (id === null) return undefined;
  return state.delegates.find((d) => d.id === id);
}
