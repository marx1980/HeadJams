import { describe, expect, it } from 'vitest';
import { leadingSilenceSamples, trimLeadingSilence } from './trimSilence';

const RATE = 16000;

/** `silenceSeconds` of very quiet noise, then a sine tone of `toneSeconds`. */
function take(silenceSeconds: number, toneSeconds: number, toneLevel = 0.5): Float32Array {
  const out = new Float32Array(Math.round((silenceSeconds + toneSeconds) * RATE));
  const onset = Math.round(silenceSeconds * RATE);
  for (let i = 0; i < out.length; i++) {
    out[i] = i < onset ? 0.0005 * Math.sin(i * 12.9898) : toneLevel * Math.sin((2 * Math.PI * 440 * i) / RATE);
  }
  return out;
}

describe('leading silence', () => {
  it('drops the silence before the first sound, keeping a short pre-roll', () => {
    const samples = take(1.2, 0.5);
    const drop = leadingSilenceSamples(samples, RATE);
    const onset = Math.round(1.2 * RATE);
    expect(drop).toBeLessThanOrEqual(onset);
    expect(onset - drop).toBeGreaterThan(Math.round(0.04 * RATE));
    expect(onset - drop).toBeLessThan(Math.round(0.07 * RATE));
  });

  it('leaves a take that starts with sound alone', () => {
    const samples = take(0, 0.5);
    expect(leadingSilenceSamples(samples, RATE)).toBe(0);
  });

  it('leaves an all-silent take alone', () => {
    expect(leadingSilenceSamples(new Float32Array(RATE), RATE)).toBe(0);
  });

  it('starts the take at beat one when there was an offset, so the first sound is on the first step', () => {
    const capture = { samples: take(0.8, 0.4), sampleRate: RATE, recordingOffsetSeconds: 2.0 };
    const trimmed = trimLeadingSilence(capture);
    expect(trimmed.samples.length).toBeLessThan(capture.samples.length);
    expect(trimmed.recordingOffsetSeconds).toBe(0);
    expect(trimmed.sampleRate).toBe(RATE);
  });

  it('keeps the offset undefined when nothing was playing', () => {
    const trimmed = trimLeadingSilence({ samples: take(0.5, 0.5), sampleRate: RATE });
    expect(trimmed.recordingOffsetSeconds).toBeUndefined();
    expect(trimmed.samples.length).toBeLessThan(RATE);
  });

  it('returns the same capture when there is nothing to trim', () => {
    const capture = { samples: take(0, 0.5), sampleRate: RATE, recordingOffsetSeconds: 1 };
    expect(trimLeadingSilence(capture)).toBe(capture);
  });
});
