import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SAMPLE_SETTINGS, detectSampleBpm, detectSamplePitch, detectSampleTrim,
  normalizeSampleSettings, processSample,
} from './sampleProcessing';

const tone = (length = 8000, rate = 8000) => Float32Array.from(
  { length },
  (_, index) => Math.sin(2 * Math.PI * 440 * index / rate) * 0.4,
);

describe('sample processing', () => {
  it('keeps processing non-destructive and normalizes a trimmed region', () => {
    const original = tone();
    const snapshot = original.slice();
    const output = processSample(original, 8000, { trimStart: 0.25, trimEnd: 0.75 });

    expect(output.length).toBe(4000);
    expect(Math.max(...output.slice(0, 1000).map(Math.abs))).toBeLessThanOrEqual(0.981);
    expect(original).toEqual(snapshot);
  });

  it('applies reverse, linked speed, pitch-preserving stretch, and musical fit', () => {
    const source = tone();
    const reversed = processSample(source, 8000, { normalize: false, reverse: true });
    expect(reversed[0]).toBeCloseTo(source[source.length - 1], 5);

    const fast = processSample(source, 8000, { normalize: false, speed: 2 });
    expect(fast.length).toBe(source.length / 2);

    const pitched = processSample(source, 8000, { normalize: false, pitchSemitones: 12 });
    expect(pitched.length).toBeCloseTo(source.length, -2);

    const fit = processSample(source, 8000, { normalize: false, fitBeats: 2 }, 120);
    expect(fit.length).toBe(8000);
  });

  it('bounds invalid settings and produces finite output for combined effects', () => {
    expect(normalizeSampleSettings({ speed: 0, targetBpm: 1000 }).speed).toBe(0.25);
    expect(normalizeSampleSettings({ speed: 0, targetBpm: 1000 }).targetBpm).toBe(240);
    const output = processSample(tone(), 8000, {
      ...DEFAULT_SAMPLE_SETTINGS, deClick: true, noiseReduction: 0.5, gateThreshold: 0.01,
      fadeIn: 0.02, fadeOut: 0.02, eqLow: 3, eqMid: -2, eqHigh: 1, highPass: 30,
      compression: 1, reverb: 0.5, delay: 0.5, distortion: 0.2, chorus: 0.3, loFi: 0.2,
    });
    expect(output.length).toBeGreaterThan(0);
    expect(output.every(Number.isFinite)).toBe(true);
    expect(Math.max(...output.map(Math.abs))).toBeLessThanOrEqual(0.981);
  });

  it('estimates BPM only for measurable audio', () => {
    const rate = 8000;
    const beat = new Float32Array(rate * 4);
    for (let second = 0; second < 4; second += 0.6) {
      const start = Math.round(second * rate);
      for (let i = 0; i < 80; i++) beat[start + i] = 0.9 * (1 - i / 80);
    }
    expect(detectSampleBpm(beat, rate)).toBe(100);
    expect(detectSampleBpm(new Float32Array(), rate)).toBeUndefined();
    expect(detectSamplePitch(tone(8000, rate), rate)).toBe(69);
    expect(detectSampleTrim(Float32Array.from([0, 0, 0.4, 0.6, 0, 0]))).toEqual([2 / 6, 4 / 6]);
    expect(detectSampleTrim(new Float32Array(10))).toEqual([0, 1]);
  });
});
