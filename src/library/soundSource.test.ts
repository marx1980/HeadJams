import { describe, expect, it } from 'vitest';
import type { SoundDef } from '../model/project';
import { createSoundSource } from './soundSource';

const sound: SoundDef = {
  id: 'synth-1',
  name: 'Synth',
  category: 'Synths',
  params: { wave: 'sine', freq: 440, freqEnd: 440, decay: 0.2, cutoff: 8000 },
};

describe('sound sources', () => {
  it('creates a lazy synth source that renders and has a stable cache key', () => {
    const source = createSoundSource(sound);
    if (source.kind !== 'synth') throw new Error('Expected a synth source.');
    expect(source.cacheKey).toContain(sound.id);
    expect(source.load(8000).some((sample) => sample !== 0)).toBe(true);
  });

  it('loads samples on demand and reports unavailable sample assets', () => {
    const sampleSound = { ...sound, sampleId: 'sample-1' };
    const source = createSoundSource(sampleSound);
    let lookups = 0;
    expect(source.kind).toBe('sample');
    if (source.kind !== 'sample') return;

    expect(source.load(8000, () => { lookups++; return undefined; })).toBeUndefined();
    expect(lookups).toBe(1);

    const samples = new Float32Array([0.25, -0.5]);
    const data = source.load(8000, (id) => id === 'sample-1'
      ? { id, samples, sampleRate: 8000 }
      : undefined);
    expect(data).toBe(samples);
    expect(source.cacheKey).toContain('sample-1');
  });

  it('can play original unprocessed audio while the sound uses processed samples by default', () => {
    const sampleSound = { ...sound, sampleId: 'sample-1', sampleVersion: 'original' as const };
    const source = createSoundSource(sampleSound);
    if (source.kind !== 'sample') throw new Error('Expected a sample source.');
    const processed = new Float32Array([0.25, 0.5]);
    const original = new Float32Array([-0.25, -0.5]);
    expect(source.load(8000, () => ({
      id: 'sample-1', samples: processed, originalSamples: original, sampleRate: 8000,
    }))).toEqual(original);
  });
});
