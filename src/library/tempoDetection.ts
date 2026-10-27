import { detectSampleBpm } from './sampleProcessing';
import type { PercussionEvent } from '../model/recognition';

export interface TempoResult {
  bpm?: number;
  alternatives: number[];
}

function normalizeTempo(value: number): number {
  let bpm = value;
  while (bpm < 40) bpm *= 2;
  while (bpm > 200) bpm /= 2;
  return Math.round(bpm);
}

export function detectTempo(
  samples: Float32Array,
  sampleRate: number,
  events: readonly PercussionEvent[] = [],
): TempoResult {
  const eventTimes = events.map((event) => event.startSeconds).sort((a, b) => a - b);
  const intervals = eventTimes.slice(1).map((time, index) => time - eventTimes[index]).filter((time) => time >= 0.2 && time <= 2);
  let bpm = intervals.length
    ? normalizeTempo(60 / intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)])
    : detectSampleBpm(samples, sampleRate);
  if (bpm !== undefined) bpm = Math.max(40, Math.min(200, bpm));
  const alternatives = bpm === undefined
    ? []
    : [...new Set([bpm / 2, bpm * 2].filter((candidate) => candidate >= 40 && candidate <= 240).map(Math.round))]
      .filter((candidate) => candidate !== bpm);
  return { bpm, alternatives };
}
