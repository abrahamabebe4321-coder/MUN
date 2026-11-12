import type { LiveFactory, LiveMapLike, LiveObjectLike } from './storageModel';

/** In-memory stand-ins for the LiveObject/LiveMap surface used by storageModel (tests only). */
export class FakeObject implements LiveObjectLike {
  data = new Map<string, unknown>();
  sets: string[] = [];
  constructor(init: Record<string, unknown> = {}) {
    for (const [k, v] of Object.entries(init)) this.data.set(k, v);
  }
  get(k: string) {
    return this.data.get(k);
  }
  set(k: string, v: unknown) {
    this.sets.push(k);
    this.data.set(k, v);
  }
}

export class FakeMap implements LiveMapLike {
  data = new Map<string, unknown>();
  ops: string[] = [];
  constructor(entries: [string, unknown][] = []) {
    for (const [k, v] of entries) this.data.set(k, v);
  }
  get(k: string) {
    return this.data.get(k);
  }
  set(k: string, v: unknown) {
    this.ops.push(`set ${k}`);
    this.data.set(k, v);
  }
  delete(k: string) {
    this.ops.push(`delete ${k}`);
    return this.data.delete(k);
  }
  entries() {
    return this.data.entries();
  }
}

export const fakeFactory: LiveFactory = {
  object: (init) => new FakeObject(init),
  map: (entries) => new FakeMap(entries),
};
