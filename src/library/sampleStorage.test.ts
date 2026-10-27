import { describe, expect, it } from 'vitest';
import { DEFAULT_SAMPLE_SETTINGS } from './sampleProcessing';
import { normalizeSampleData } from './sampleStorage';

describe('sample storage compatibility', () => {
  it('hydrates legacy sample records with an unchanged original and default settings', () => {
    const legacy = { id: 'legacy-sample', samples: Float32Array.from([0.1, -0.2]), sampleRate: 44100 };
    const normalized = normalizeSampleData(legacy);

    expect(normalized.id).toBe(legacy.id);
    expect(normalized.samples).toEqual(legacy.samples);
    expect(normalized.originalSamples).toEqual(legacy.samples);
    expect(normalized.originalSamples).not.toBe(normalized.samples);
    expect(normalized.processingSettings).toEqual(DEFAULT_SAMPLE_SETTINGS);
    expect(normalized.metadataVersion).toBe(2);
  });
});
