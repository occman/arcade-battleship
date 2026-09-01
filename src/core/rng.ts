export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates shuffle in place; returns the same array. */
  shuffle<T>(items: T[]): T[];
  chance(probability: number): boolean;
}

/** Seedable mulberry32 PRNG. Omit the seed for a random one. */
export function createRng(seed: number = Math.floor(Math.random() * 0xffffffff)): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    pick: (items) => {
      if (items.length === 0) throw new Error('pick() from empty array');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    shuffle: (items) => {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const a = items[i] as (typeof items)[number];
        items[i] = items[j] as (typeof items)[number];
        items[j] = a;
      }
      return items;
    },
    chance: (p) => next() < p,
  };
  return rng;
}
