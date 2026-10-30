import { describe, expect, it } from 'vitest';
import { suggestProgressions, type Mood } from './progressions';
import type { NoteEvent } from '../model/project';

// C D E G | E D C C as quarter notes over two bars at 1/16.
const melody: NoteEvent[] = [60, 62, 64, 67, 64, 62, 60, 60].map((pitch, index) => ({ id: `n${index}`, step: index * 4, pitch, durationSteps: 4 }));
const run = (mood: Mood) => suggestProgressions(melody, { root: 0, scaleId: 'major' }, 16, 2, { halfBar: true, mood });
const names = (mood: Mood) => run(mood).map((progression) => progression.chords.map((chord) => `${chord.root % 12}:${chord.quality}`));
const all = (mood: Mood) => names(mood).flat();

describe('progression moods', () => {
  it('Any is the default behaviour', () => {
    expect(names('any')).toEqual(suggestProgressions(melody, { root: 0, scaleId: 'major' }, 16, 2, { halfBar: true }).map((progression) => progression.chords.map((chord) => `${chord.root % 12}:${chord.quality}`)));
  });

  it('Bright keeps Different on major chords', () => {
    const [, different] = names('bright');
    expect(different.every((chord) => chord.endsWith(':major'))).toBe(true);
    expect(names('any')[1].some((chord) => chord.includes('minor'))).toBe(true);
  });

  it('Dark brings in minor or borrowed chords', () => {
    const dark = all('dark');
    const darkish = (list: string[]) => list.filter((chord) => /minor/.test(chord) || /^(5:minor|8:major|10:major)$/.test(chord)).length;
    expect(darkish(dark)).toBeGreaterThan(darkish(all('any')));
  });

  it('Epic leans on IV, ♭VI and ♭VII', () => {
    const lifts = (list: string[]) => list.filter((chord) => /^(5|8|10):(major|major7|sus2)$/.test(chord)).length;
    expect(lifts(all('epic'))).toBeGreaterThan(lifts(all('any')));
  });

  it('Dreamy colours more chords', () => {
    const coloured = (list: string[]) => list.filter((chord) => /major7|minor7|sus2|sus4/.test(chord)).length;
    expect(coloured(all('dreamy'))).toBeGreaterThan(coloured(all('any')));
  });

  it('every mood still fits the melody', () => {
    for (const mood of ['bright', 'dreamy', 'dark', 'epic'] as Mood[]) {
      for (const progression of run(mood)) expect(progression.fit).toBeGreaterThanOrEqual(0.5);
    }
  });
});
