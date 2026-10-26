import { describe, expect, it } from 'vitest';
import { chordPitches, isPitchInScale, pitchToFrequency, SCALES, scalePitches, snapPitchToScale } from './music';

describe('music theory helpers', () => {
  const major = SCALES.find((scale) => scale.id === 'major')!;

  it('identifies pitches in a scale across octaves', () => {
    expect(isPitchInScale(60, 0, major)).toBe(true);
    expect(isPitchInScale(61, 0, major)).toBe(false);
    expect(isPitchInScale(73, 0, major)).toBe(true);
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
  });

  it('converts MIDI pitches to equal-tempered frequency', () => {
    expect(pitchToFrequency(69)).toBe(440);
    expect(pitchToFrequency(60)).toBeCloseTo(261.63, 1);
  });
});
