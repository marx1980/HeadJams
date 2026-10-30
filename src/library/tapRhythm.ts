/** Tap rhythm (hum.md H5): taps over the playing loop become a reusable rhythm on the step grid. */

export interface Rhythm {
  /** Loop length in steps the rhythm was tapped over. */
  length: number;
  /** Step → strength (0–1); more taps landing on a step, or a harder tap, make it stronger. */
  hits: Record<number, number>;
}

export interface TapTiming {
  bpm: number;
  stepsPerBar: number;
  totalSteps: number;
  /** Milliseconds (same clock as the taps) when the loop's first step was heard. */
  beatZeroMs: number;
}

/** Quantise taps (ms timestamps, optional 0–1 strength) to the nearest step of the loop. */
export function tapsToRhythm(taps: readonly { ms: number; strength?: number }[], timing: TapTiming): Rhythm {
  const stepMs = (60000 / timing.bpm) * 4 / timing.stepsPerBar;
  const hits: Record<number, number> = {};
  const counts: Record<number, number> = {};
  for (const tap of taps) {
    if (!Number.isFinite(tap.ms)) continue;
    const position = Math.round((tap.ms - timing.beatZeroMs) / stepMs);
    const step = ((position % timing.totalSteps) + timing.totalSteps) % timing.totalSteps;
    counts[step] = (counts[step] ?? 0) + 1;
    hits[step] = Math.max(hits[step] ?? 0, Math.max(0.1, Math.min(1, tap.strength ?? 0.8)));
  }
  // Steps tapped on several passes of the loop are the ones the player meant most.
  const most = Math.max(1, ...Object.values(counts));
  for (const step of Object.keys(hits)) {
    const index = Number(step);
    hits[index] = Math.min(1, hits[index] * (0.75 + 0.25 * counts[index] / most));
  }
  return { length: timing.totalSteps, hits };
}

export const rhythmSteps = (rhythm: Rhythm): number[] => Object.keys(rhythm.hits).map(Number).sort((a, b) => a - b);

/**
 * A one-bar strum pattern (patterns.ts format) from a rhythm: hits on beats and eighths strum down,
 * sixteenth offbeats strum up; the strongest hits are accented. Bars are folded onto one bar.
 */
export function rhythmToStrumBar(rhythm: Rhythm, stepsPerBar: number): string {
  const bar = Array<string>(16).fill('.');
  const scale = 16 / stepsPerBar;
  for (const step of rhythmSteps(rhythm)) {
    const index = Math.round((step % stepsPerBar) * scale);
    if (index < 0 || index > 15) continue;
    const strong = rhythm.hits[step] >= 0.85;
    const down = index % 2 === 0;
    bar[index] = down ? (strong ? 'D' : 'd') : (strong ? 'U' : 'u');
  }
  return bar.join('');
}
