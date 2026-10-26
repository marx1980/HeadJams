import { describe, expect, it } from 'vitest';
import { normalizeSample, trimSample } from './sampleStorage';

describe('sample editing', () => {
  it('trims within the sample bounds', () => {
    expect(trimSample(new Float32Array([0, 1, 2, 3]), 1, 3)).toEqual(new Float32Array([1, 2]));
    expect(trimSample(new Float32Array([0, 1]), -5, 20)).toEqual(new Float32Array([0, 1]));
  });

  it('normalizes to a safe peak and handles silence', () => {
    expect(normalizeSample(new Float32Array([0.25, -0.5]))).toEqual(new Float32Array([0.49, -0.98]));
    expect(normalizeSample(new Float32Array([0, 0]))).toEqual(new Float32Array([0, 0]));
  });
});
