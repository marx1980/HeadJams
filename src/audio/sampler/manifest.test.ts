import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { validateManifest, type InstrumentManifest } from './manifest';

const dir = new URL('../../../app/public/instruments/test-sine/', import.meta.url);
const fixture = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8')) as InstrumentManifest;
const files = new Set(readdirSync(dir));
const clone = (): InstrumentManifest => JSON.parse(JSON.stringify(fixture)) as InstrumentManifest;

describe('validateManifest', () => {
  it('accepts the CC0 test instrument with full coverage', () => {
    const report = validateManifest(fixture, { files });
    expect(report.errors).toEqual([]);
    expect(report.uncoveredNotes).toEqual([]);
    for (const region of fixture.regions) {
      expect(readFileSync(new URL(region.file, dir)).subarray(0, 4).toString()).toBe('RIFF');
    }
  });

  it('reports missing files, duplicate ids and overlapping regions', () => {
    const m = clone();
    m.regions.push({ ...m.regions[0] });
    m.regions.push({ ...m.regions[1], id: 'extra', file: 'nope.wav' });
    const { errors } = validateManifest(m, { files });
    expect(errors).toContain('region sine-48: duplicate id');
    expect(errors).toContain('region extra: missing file nope.wav');
    expect(errors.some((error) => error.includes('overlap'))).toBe(true);
  });

  it('allows overlap only between round-robin alternatives', () => {
    const m = clone();
    m.regions = [
      { ...m.regions[0], id: 'a', roundRobinGroup: 'g', roundRobinIndex: 0 },
      { ...m.regions[0], id: 'b', roundRobinGroup: 'g', roundRobinIndex: 1 },
    ];
    expect(validateManifest(m).errors).toEqual([]);
  });

  it('requires redistribution rights for bundled instruments only', () => {
    const m = clone();
    m.provenance.redistribution = false;
    expect(validateManifest(m).errors.some((error) => error.includes('redistribution'))).toBe(true);
    expect(validateManifest(m, { bundled: false }).errors).toEqual([]);
  });

  it('reports coverage gaps and over-stretched ranges as warnings', () => {
    const m = clone();
    m.regions = [m.regions[0], { ...m.regions[2], lowMidi: 60, highMidi: 84 }];
    const report = validateManifest(m);
    expect(report.errors).toEqual([]);
    expect(report.uncoveredNotes).toEqual([54, 55, 56, 57, 58, 59]);
    expect(report.warnings.some((warning) => warning.includes('12 semitones'))).toBe(true);
  });

  it('rejects malformed input', () => {
    expect(validateManifest(null).errors).toEqual(['Manifest is not an object']);
    const m = clone() as unknown as Record<string, unknown>;
    m.family = 'kazoo';
    m.pitchShiftLimitSemitones = 40;
    const { errors } = validateManifest(m);
    expect(errors.some((error) => error.startsWith('family'))).toBe(true);
    expect(errors).toContain('pitchShiftLimitSemitones must be between 0 and 24');
  });
});
