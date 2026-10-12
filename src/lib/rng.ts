/**
 * Tiny deterministic PRNG (mulberry32) so a demo session can be reproduced
 * from a seed — handy for debugging and screenshots.
 */
export function createRng(seed = Math.floor(Math.random() * 0xffffffff)): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const randRange = (rng: () => number, min: number, max: number): number => min + rng() * (max - min)

export const randInt = (rng: () => number, min: number, max: number): number => Math.floor(randRange(rng, min, max + 1))

export function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length) % list.length]
}
