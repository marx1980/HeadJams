import { describe, expect, it } from 'vitest';
import type { InstrumentManifest, SampleRegion } from './manifest';
import { dbToGain, midiVelocity, RoundRobin, selectRegion } from './selectRegion';

const region = (id: string, root: number, low: number, high: number, extra: Partial<SampleRegion> = {}): SampleRegion => ({
  id, file: `${id}.wav`, rootMidi: root, lowMidi: low, highMidi: high, velocityLow: 1, velocityHigh: 127, articulation: 'sustain', ...extra,
});

const manifest = (regions: SampleRegion[], extra: Partial<InstrumentManifest> = {}): InstrumentManifest => ({
  schemaVersion: 1, id: 'inst', name: 'Inst', family: 'other', version: 1, engine: 'sampler', defaultArticulation: 'sustain',
  maxPolyphony: 8, pitchShiftLimitSemitones: 4, preloadStrategy: 'all',
  provenance: { source: 's', url: 'u', creator: 'c', licence: 'CC0-1.0', obtained: '2026-10-30', redistribution: true, modification: true },
  regions, ...extra,
});

describe('selectRegion', () => {
  it('prefers the region whose range contains the note and computes the playback rate', () => {
    const m = manifest([region('c4', 60, 58, 62), region('e4', 64, 63, 66)]);
    const choice = selectRegion(m, { midi: 62, velocity: 100 })!;
    expect(choice.region.id).toBe('c4');
    expect(choice.rate).toBeCloseTo(2 ** (2 / 12));
    expect(selectRegion(m, { midi: 63, velocity: 100 })!.region.id).toBe('e4');
  });

  it('falls back to the nearest root within the pitch-shift limit, and refuses beyond it', () => {
    const m = manifest([region('c4', 60, 60, 60)]);
    expect(selectRegion(m, { midi: 64, velocity: 100 })!.region.id).toBe('c4');
    expect(selectRegion(m, { midi: 65, velocity: 100 })).toBeUndefined();
    expect(selectRegion(manifest([region('wide', 60, 40, 80)]), { midi: 70, velocity: 100 })).toBeUndefined();
  });

  it('chooses velocity layers by their inclusive bounds, or the nearest layer in a gap', () => {
    const m = manifest([
      region('soft', 60, 55, 65, { velocityLow: 1, velocityHigh: 63 }),
      region('loud', 60, 55, 65, { velocityLow: 80, velocityHigh: 127 }),
    ]);
    expect(selectRegion(m, { midi: 60, velocity: 63 })!.region.id).toBe('soft');
    expect(selectRegion(m, { midi: 60, velocity: 80 })!.region.id).toBe('loud');
    expect(selectRegion(m, { midi: 60, velocity: 66 })!.region.id).toBe('soft');
    expect(selectRegion(m, { midi: 60, velocity: 78 })!.region.id).toBe('loud');
  });

  it('uses the requested articulation when available, otherwise the default', () => {
    const m = manifest([region('sus', 60, 55, 65), region('mute', 60, 55, 65, { articulation: 'palm-mute' })]);
    expect(selectRegion(m, { midi: 60, velocity: 100, articulation: 'palm-mute' })!.region.id).toBe('mute');
    expect(selectRegion(m, { midi: 60, velocity: 100, articulation: 'harmonic' })!.region.id).toBe('sus');
  });

  it('cycles round robins without immediate repetition and repeats exactly for the same seed', () => {
    const m = manifest([0, 1, 2].map((i) => region(`rr${i}`, 60, 55, 65, { roundRobinGroup: 'g', roundRobinIndex: i })));
    const sequence = (seed: number) => {
      const rr = new RoundRobin(seed);
      return Array.from({ length: 7 }, () => selectRegion(m, { midi: 60, velocity: 100 }, rr)!.region.id);
    };
    const first = sequence(7);
    expect(first).toEqual(sequence(7));
    for (let i = 1; i < first.length; i++) expect(first[i]).not.toBe(first[i - 1]);
    expect(new Set(first.slice(0, 3)).size).toBe(3);
    expect(selectRegion(m, { midi: 60, velocity: 100 })!.region.id).toBe('rr0');
  });

  it('applies tuning and level offsets', () => {
    const m = manifest([region('c4', 60, 60, 60, { tuneCents: -50, gainDb: -6 })], { gainDb: 3 });
    const choice = selectRegion(m, { midi: 60, velocity: 100 })!;
    expect(choice.rate).toBeCloseTo(2 ** (-50 / 1200));
    expect(choice.gain).toBeCloseTo(dbToGain(-3));
  });

  it('maps project velocity to MIDI velocity', () => {
    expect(midiVelocity(undefined)).toBe(127);
    expect(midiVelocity(0)).toBe(1);
    expect(midiVelocity(0.5)).toBe(64);
    expect(midiVelocity(2)).toBe(127);
  });
});
