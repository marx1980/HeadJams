/** Seeded randomness and strum timing for the guitar performer (expansion.md E3). */

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Small deterministic PRNG (mulberry32): same seed, same sequence, in playback and export. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Start offsets (seconds) for `count` strings spread over `strumSec`. Humanise jitters each gap by up to
 * ±humanise·40% without ever reordering the strings.
 */
export function strumOffsets(count: number, strumSec: number, humanise: number, random: () => number): number[] {
  if (count <= 1 || strumSec <= 0) return Array(Math.max(0, count)).fill(0);
  const gap = strumSec / (count - 1);
  const offsets = [0];
  for (let i = 1; i < count; i++) {
    const jitter = (random() * 2 - 1) * Math.max(0, Math.min(1, humanise)) * 0.4;
    offsets.push(offsets[i - 1] + gap * (1 + jitter));
  }
  return offsets;
}
