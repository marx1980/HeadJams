import { describe, expect, it } from 'vitest';
import {
  chordPitches, formatChordSymbol, guitarChordPitches, isPitchInScale, pitchToFrequency, SCALES,
  scalePitches, snapPitchToScale,
} from './music';

describe('music theory helpers', () => {
  const major = SCALES.find((scale) => scale.id === 'major')!;

  it('identifies pitches in a scale across octaves', () => {
    expect(isPitchInScale(60, 0, major)).toBe(true);
    expect(isPitchInScale(61, 0, major)).toBe(false);
    expect(isPitchInScale(72, 0, major)).toBe(true);
  });

  it('snaps out-of-scale pitches to the nearest note, preferring the lower note on ties', () => {
    expect(snapPitchToScale(61, 0, major)).toBe(60);
    expect(snapPitchToScale(66, 0, major)).toBe(65);
  });

  it('lists scale pitches over the requested octave range', () => {
    expect(scalePitches(60, major, 1)).toEqual([60, 62, 64, 65, 67, 69, 71]);
    expect(scalePitches(60, major, 0)).toEqual([]);
  });

  it('builds supported chord voicings from a MIDI pitch', () => {
    expect(chordPitches(60, 'major')).toEqual([60, 64, 67]);
    expect(chordPitches(60, 'minor')).toEqual([60, 63, 67]);
    expect(chordPitches(60, 'sus4')).toEqual([60, 65, 67]);
    expect(chordPitches(60, 'seventh')).toEqual([60, 64, 67, 70]);
    expect(chordPitches(60, 'major7')).toEqual([60, 64, 67, 71]);
    expect(chordPitches(60, 'minor7')).toEqual([60, 63, 67, 70]);
  });

  it('resolves guitar chords to distinct playable string pitches and keeps power chords explicit', () => {
    const pitches = guitarChordPitches(60, 'major');
    expect(pitches.length).toBe(3);
    expect(new Set(pitches).size).toBe(pitches.length);
    expect(pitches.every((pitch) => pitch >= 40 && pitch <= 76)).toBe(true);
    expect(pitches.map((pitch) => (pitch - 60 + 120) % 12)).toEqual(expect.arrayContaining([0, 4, 7]));
    expect(guitarChordPitches(60, 'major', 'power').map((pitch) => (pitch - 60 + 120) % 12))
      .toEqual(expect.arrayContaining([0, 7]));
    expect(formatChordSymbol(60, 'minor7')).toBe('Cm7');
    expect(formatChordSymbol(60, 'major', 'power')).toBe('C5');
  });

  it('converts MIDI pitches to equal-tempered frequency', () => {
    expect(pitchToFrequency(69)).toBe(440);
    expect(pitchToFrequency(60)).toBeCloseTo(261.63, 1);
  });
});
