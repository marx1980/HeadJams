import { describe, expect, it } from 'vitest';
import { detectKey, suggestProgressions } from './progressions';
import type { NoteEvent } from '../model/project';
import { createChannel, createProject } from '../model/project';
import { addProgressionTrack, auditionProject, progressionEvents } from '../model/chordTrack';

const melody = (spec: [number, number][], each: number): NoteEvent[] => {
  let step = 0;
  return spec.map(([pitch, length], i) => {
    const note = { id: `n${i}`, step, pitch, durationSteps: length * each };
    step += length * each;
    return note;
  });
};
const HUM = melody([[60, 1], [62, 1], [64, 1], [67, 1], [64, 1], [62, 1], [60, 1], [60, 1]], 4);
const A_MINOR = melody([[69, 2], [72, 1], [76, 1], [74, 2], [72, 1], [71, 1], [69, 2], [64, 2], [69, 4]], 2);
const G_MAJOR = melody([[67, 1], [71, 1], [74, 1], [71, 1], [72, 1], [69, 1], [66, 1], [67, 1]], 4);

describe('key detection', () => {
  it('finds the key of hummed phrases, with a confidence', () => {
    expect(detectKey(HUM)).toMatchObject({ root: 0, scaleId: 'major' });
    expect(detectKey(A_MINOR)).toMatchObject({ root: 9, scaleId: 'minor' });
    expect(detectKey(G_MAJOR)).toMatchObject({ root: 7, scaleId: 'major' });
    expect(detectKey(HUM)!.confidence).toBeGreaterThanOrEqual(0.5);
    expect(detectKey([])).toBeUndefined();
  });
});

describe('progressions', () => {
  const tiles = (chords: { step: number; durationSteps: number }[], total: number) => {
    let at = 0;
    for (const chord of chords) { expect(chord.step).toBe(at); at += chord.durationSteps; }
    expect(at).toBe(total);
  };

  it('offers Simple, Different and Colour that each cover the loop and repeat exactly', () => {
    for (const [notes, key] of [[HUM, { root: 0, scaleId: 'major' }], [A_MINOR, { root: 9, scaleId: 'minor' }], [G_MAJOR, { root: 7, scaleId: 'major' }]] as const) {
      for (const halfBar of [false, true]) {
        const result = suggestProgressions(notes, key, 16, 2, { halfBar });
        expect(result.map((p) => p.id)).toEqual(['simple', 'different', 'colour']);
        for (const progression of result) tiles(progression.chords, 32);
        expect(result).toEqual(suggestProgressions(notes, key, 16, 2, { halfBar }));
      }
    }
  });

  it('Simple starts at home and fits the melody; Different changes something; Colour keeps Simple\'s roots', () => {
    const [simple, different, colour] = suggestProgressions(HUM, { root: 0, scaleId: 'major' }, 16, 2, { halfBar: true });
    expect(simple.chords[0]).toMatchObject({ root: 48, quality: 'major' });
    expect(simple.fit).toBeGreaterThanOrEqual(0.75);
    const shape = (p: typeof simple) => p.chords.map((c) => `${c.step}:${c.root}:${c.quality}`).join(' ');
    expect(shape(different)).not.toBe(shape(simple));
    const rootsAt = (p: typeof simple, step: number) => p.chords.filter((c) => c.step <= step).at(-1)!.root;
    for (const step of [0, 8, 16, 24]) expect(rootsAt(colour, step)).toBe(rootsAt(simple, step));
    expect(colour.chords.some((c) => ['major7', 'minor7', 'seventh', 'sus2', 'sus4'].includes(c.quality))).toBe(true);
    expect(suggestProgressions(A_MINOR, { root: 9, scaleId: 'minor' }, 16, 2)[0].chords[0]).toMatchObject({ root: 57, quality: 'minor' });
  });
});

describe('progression tracks', () => {
  const [simple] = suggestProgressions(HUM, { root: 0, scaleId: 'major' }, 16, 2, { halfBar: false });

  it('guitar strums every half bar; piano and strings voice chords smoothly above a bass note', () => {
    const guitar = progressionEvents(simple, 'guitar', 16);
    expect(guitar.notes).toEqual([]);
    expect(guitar.chordEvents.map((e) => e.step)).toEqual([0, 8, 16, 24].slice(0, guitar.chordEvents.length));
    const piano = progressionEvents(simple, 'piano', 16);
    for (const note of piano.notes) expect(note.pitch).toBeGreaterThanOrEqual(36);
    const upper = piano.notes.filter((n) => n.pitch >= 52);
    for (const note of upper) expect(note.pitch).toBeLessThanOrEqual(72);
  });

  it('Use adds a separate generated track and leaves the melody alone; audition plays only melody + chords', () => {
    const project = createProject('p');
    project.loopBars = 2 as never;
    project.channels = [{ ...createChannel('m', 'Melody', 'grand-piano', 32), notes: HUM }];
    const used = addProgressionTrack(project, 'm', simple, 'strings');
    expect(used.channels).toHaveLength(2);
    expect(used.channels[0]).toEqual(project.channels[0]);
    expect(used.channels[1]).toMatchObject({ soundId: 'strings', generatedMetadata: { kind: 'chord-suggestions', sourceChannelId: 'm' } });
    expect(used.channels[1].notes.length).toBeGreaterThan(0);
    const preview = auditionProject(project, 'm', simple, 'guitar')!;
    expect(preview.channels.map((c) => c.soundId)).toEqual(['grand-piano', 'nylon-chords']);
    expect(preview.arrangement).toEqual([]);
    expect(project.channels).toHaveLength(1);
  });
});
