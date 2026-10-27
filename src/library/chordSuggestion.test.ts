import { describe, expect, it } from 'vitest';
import { suggestChordsFromNotes } from './chordSuggestion';
import { chordPitches, isPitchInScale, SCALES } from '../model/music';
import type { NoteEvent } from '../model/project';

const notes = (pitches: number[], confidence = 0.9): NoteEvent[] =>
  pitches.map((pitch, index) => ({ id: `note-${index}`, step: index, pitch, durationSteps: 1, confidence }));

describe('melody chord suggestions', () => {
  it('suggests a supported major chord for a major triad melody', () => {
    const [suggestion] = suggestChordsFromNotes(notes([60, 64, 67]), 0, 'major', 4, 1);
    expect(suggestion).toMatchObject({ root: 60, quality: 'major', step: 0, durationSteps: 4 });
    expect(suggestion.confidence).toBeGreaterThan(0.7);
    expect(suggestion.alternatives.length).toBeGreaterThan(0);
  });

  it('finds a minor chord from a minor-key melody', () => {
    const [suggestion] = suggestChordsFromNotes(notes([69, 72, 76]), 9, 'minor', 4, 1);
    expect(suggestion).toMatchObject({ root: 69, quality: 'minor' });
  });

  it('creates one suggestion per bar with notes and skips silent bars', () => {
    const suggestions = suggestChordsFromNotes([
      { id: 'first', step: 1, pitch: 60, durationSteps: 1 },
      { id: 'third', step: 9, pitch: 67, durationSteps: 1 },
    ], 0, 'major', 4, 3);
    expect(suggestions.map((item) => item.step)).toEqual([0, 8]);
    expect(suggestions.every((item) => item.durationSteps === 4)).toBe(true);
  });

  it('keeps every suggested chord tone in the selected scale', () => {
    const suggestion = suggestChordsFromNotes(notes([62, 65, 69]), 2, 'minor', 4, 1)[0];
    const scale = SCALES.find((item) => item.id === 'minor')!;
    expect(chordPitches(suggestion.root, suggestion.quality)
      .every((pitch) => isPitchInScale(pitch, 2, scale))).toBe(true);
  });

  it('returns no suggestions for empty melodies or invalid bar settings', () => {
    expect(suggestChordsFromNotes([], 0, 'major', 4, 1)).toEqual([]);
    expect(suggestChordsFromNotes(notes([60]), 0, 'major', 0, 1)).toEqual([]);
    expect(suggestChordsFromNotes(notes([60]), 0, 'major', 4, 0)).toEqual([]);
  });

  it('reduces confidence for uncertain source notes', () => {
    const certain = suggestChordsFromNotes(notes([60, 64, 67], 1), 0, 'major', 4, 1)[0];
    const uncertain = suggestChordsFromNotes(notes([60, 64, 67], 0.1), 0, 'major', 4, 1)[0];
    expect(uncertain.confidence).toBeLessThan(certain.confidence);
  });
});
