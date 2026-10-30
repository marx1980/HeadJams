import type { CaptureResult } from './capture';

/** Analysis window and the room kept before the first sound, so the attack is not clipped. */
const WINDOW_SECONDS = 0.01;
const PREROLL_SECONDS = 0.05;
/** Below this peak level the take is treated as silence and left alone. */
const SILENCE_PEAK = 0.005;
/** Windows quieter than this (or than a fifth of the loudest window) count as silence. */
const MIN_THRESHOLD = 0.01;
const PEAK_FRACTION = 0.2;

/** How many leading samples are silent before the mic picks up the first sound. */
export function leadingSilenceSamples(samples: Float32Array, sampleRate: number): number {
  const windowLength = Math.max(1, Math.round(sampleRate * WINDOW_SECONDS));
  const windows = Math.floor(samples.length / windowLength);
  const levels = new Float32Array(windows);
  let peak = 0;
  for (let w = 0; w < windows; w++) {
    let sum = 0;
    const from = w * windowLength;
    for (let i = from; i < from + windowLength; i++) sum += samples[i] * samples[i];
    levels[w] = Math.sqrt(sum / windowLength);
    if (levels[w] > peak) peak = levels[w];
  }
  if (peak < SILENCE_PEAK) return 0;
  const threshold = Math.max(MIN_THRESHOLD, peak * PEAK_FRACTION);
  const first = levels.findIndex((level) => level >= threshold);
  if (first <= 0) return 0;
  return Math.max(0, first * windowLength - Math.round(sampleRate * PREROLL_SECONDS));
}

/**
 * Start the take at the first sound: the silence before it is removed and the take starts at beat one,
 * so the empty steps are not put on the grid. Later notes keep their timing from the first sound.
 */
export function trimLeadingSilence(capture: CaptureResult): CaptureResult {
  const drop = leadingSilenceSamples(capture.samples, capture.sampleRate);
  if (drop === 0) return capture;
  return {
    ...capture,
    samples: capture.samples.slice(drop),
    ...(capture.recordingOffsetSeconds === undefined ? {} : { recordingOffsetSeconds: 0 }),
  };
}
