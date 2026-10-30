import { describe, expect, it } from 'vitest';
import { CHORD_QUALITIES, chordPitches } from '../../model/music';
import { candidateVoicings, chooseVoicing } from './voicings';
import { seededRandom, strumOffsets } from './strum';

describe('guitar voicing dictionary', () => {
  it('every shape plays only chord tones, includes the root, and spans at most 4 frets', () => {
    for (let pc = 0; pc < 12; pc++) {
      for (const { id } of CHORD_QUALITIES) {
        const tones = new Set(chordPitches(60 + pc, id).map((p) => p % 12));
        for (const voicing of candidateVoicings(pc, id)) {
          const classes = voicing.notes.map((n) => n.midi % 12);
          expect(classes.every((c) => tones.has(c)), `${pc} ${id} ${voicing.frets}`).toBe(true);
          expect(classes).toContain(pc);
          expect(voicing.notes.length).toBeGreaterThanOrEqual(3);
          const fretted = voicing.notes.filter((n) => n.fret > 0).map((n) => n.fret);
          if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(4);
        }
      }
    }
  });

  it('covers every root and quality, and power chords are root + fifth', () => {
    for (let pc = 0; pc < 12; pc++) {
      for (const { id } of CHORD_QUALITIES) expect(candidateVoicings(pc, id).length, `${pc} ${id}`).toBeGreaterThan(0);
      for (const voicing of candidateVoicings(pc, 'power')) {
        expect(new Set(voicing.notes.map((n) => n.midi % 12))).toEqual(new Set([pc, (pc + 7) % 12]));
      }
    }
  });

  it('prefers open chords and stays close to the previous shape', () => {
    expect(chooseVoicing(0, 'major')!.frets).toEqual([null, 3, 2, 0, 1, 0]);
    expect(chooseVoicing(4, 'minor')!.frets).toEqual([0, 2, 2, 0, 0, 0]);
    const highF = chooseVoicing(5, 'major', chooseVoicing(10, 'major', { frets: [6, 8, 8, 7, 6, 6], notes: [{ string: 0, fret: 6, midi: 46 }, { string: 1, fret: 8, midi: 53 }], open: false, barre: true }));
    expect(highF!.open).toBe(false);
  });
});

describe('strum timing', () => {
  it('spreads strings over the strum, keeps order, and repeats for the same seed', () => {
    const a = strumOffsets(6, 0.05, 1, seededRandom(42));
    expect(a).toEqual(strumOffsets(6, 0.05, 1, seededRandom(42)));
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeGreaterThan(a[i - 1]);
    expect(a[5]).toBeGreaterThan(0.03);
    expect(a[5]).toBeLessThan(0.07);
    strumOffsets(6, 0.05, 0, seededRandom(1)).forEach((offset, i) => expect(offset).toBeCloseTo(i * 0.01, 9));
    expect(strumOffsets(1, 0.05, 1, seededRandom(1))).toEqual([0]);
  });
});

describe('chord performance', () => {
  const event = (id: string, step: number, root: number, articulation: 'down-strum' | 'up-strum' | 'power' | 'sustained' = 'down-strum') =>
    ({ id, step, root, quality: 'major' as const, articulation, durationSteps: 4 });

  it('down-strums run low to high, up-strums high to low, and repeat exactly for the same seed', async () => {
    const { performChord, voiceChordSequence } = await import('./performer');
    const down = event('a', 0, 48);
    const voicing = voiceChordSequence([down]).get('a')!;
    const strokes = performChord(down, voicing, '1:ch:0');
    expect(strokes.map((s) => s.string)).toEqual([...strokes.map((s) => s.string)].sort((a, b) => a - b));
    expect(strokes).toEqual(performChord(down, voicing, '1:ch:0'));
    const up = performChord(event('b', 0, 48, 'up-strum'), voicing, '1:ch:0');
    expect(up.map((s) => s.string)).toEqual([...up.map((s) => s.string)].sort((a, b) => b - a));
    expect(up[0].velocity).toBeLessThan(strokes[0].velocity);
  });

  it('chooses a whole progression of shapes in sequence', async () => {
    const { voiceChordSequence } = await import('./performer');
    const shapes = voiceChordSequence([event('c', 0, 48), event('g', 4, 55), event('a', 8, 57), event('f', 12, 53)]);
    expect(shapes.get('c')!.frets).toEqual([null, 3, 2, 0, 1, 0]);
    expect(shapes.get('g')!.open).toBe(true);
    expect(shapes.get('f')!.notes.map((n) => n.midi % 12)).toContain(5);
    const power = voiceChordSequence([event('p', 0, 45, 'power')]).get('p')!;
    expect(power.notes).toHaveLength(3);
  });
});
