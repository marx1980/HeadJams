import { describe, expect, it } from 'vitest';
import { harmonyFor, nextPhrase, PHRASE_VARIATIONS } from './phrases';
import { withNextPhrase } from '../model/phraseProject';
import { channelsForPlaybackStep, createChannel, createProject, type NoteEvent } from '../model/project';

const C = { root: 0, scaleId: 'major' };
const phrase: NoteEvent[] = [[0, 60, 2], [2, 62, 2], [4, 64, 4], [8, 67, 4], [12, 64, 2], [14, 62, 2]]
  .map(([step, pitch, durationSteps], i) => ({ id: `n${i}`, step, pitch, durationSteps }));

describe('harmony presets', () => {
  it('Subtle: a quiet third above on held notes; Warm: a third below; Wide: a sixth below and a fifth above', () => {
    const subtle = harmonyFor(phrase, C, 'subtle', 16);
    expect(subtle.map((n) => [n.step, n.pitch])).toEqual([[0, 64], [2, 65], [4, 67], [8, 71], [12, 67], [14, 65]]);
    expect(harmonyFor([{ id: 'x', step: 0, pitch: 60, durationSteps: 1 }], C, 'subtle', 16)).toEqual([]);
    expect(harmonyFor(phrase, C, 'warm', 16).map((n) => n.pitch)).toEqual([57, 59, 60, 64, 60, 59]);
    const wide = harmonyFor(phrase, C, 'wide', 16).filter((n) => n.step === 0).map((n) => n.pitch);
    expect(wide).toEqual([52, 67]);
    expect(harmonyFor(phrase, C, 'warm', 16).every((n) => [0, 2, 4, 5, 7, 9, 11].includes(n.pitch % 12))).toBe(true);
  });
});

describe('next phrase', () => {
  it('keeps the rhythm, lands on the tonic, differs per variation and repeats exactly for the same seed', () => {
    const results = PHRASE_VARIATIONS.map((variation) => nextPhrase(phrase, C, variation.id, 7));
    for (const notes of results) {
      expect(notes[0].step).toBe(0);
      expect(notes.at(-1)!.pitch % 12).toBe(0);
      expect(notes.every((n) => [0, 2, 4, 5, 7, 9, 11].includes(n.pitch % 12))).toBe(true);
      expect(notes.map((n) => n.id.startsWith('phrase-'))).not.toContain(false);
    }
    expect(results[0].map((n) => [n.step, n.durationSteps])).toEqual(phrase.map((n) => [n.step, n.durationSteps]));
    expect(results.map((r) => r.map((n) => n.pitch).join())).toHaveLength(3);
    expect(new Set(results.map((r) => r.map((n) => n.pitch).join())).size).toBe(3);
    expect(nextPhrase(phrase, C, 'answer', 7)).toEqual(nextPhrase(phrase, C, 'answer', 7));
    expect(nextPhrase(phrase, C, 'twist', 7).length).toBeGreaterThanOrEqual(phrase.length);
  });

  it('Use puts the new phrase after the current one, marked as generated, and leaves the original alone', () => {
    const project = createProject('p');
    project.loopBars = 1 as never;
    project.channels = [{ ...createChannel('m', 'Melody', 'grand-piano', 16), notes: phrase }];
    const notes = nextPhrase(phrase, C, 'echo', 1);
    const next = withNextPhrase(project, 'm', notes, 'Melody · Echo');
    expect(next.patterns).toHaveLength(2);
    expect(next.currentPatternId).toBe(next.patterns[0].id);
    expect(next.channels[0].notes).toEqual(phrase);
    expect(next.arrangement.map((clip) => [clip.patternId, clip.startStep, clip.lengthSteps]))
      .toEqual([[next.patterns[0].id, 0, 16], [next.patterns[1].id, 16, 16]]);
    const b = next.patterns[1].channels[0];
    expect(b.notes).toEqual(notes);
    expect(b.generatedMetadata).toMatchObject({ kind: 'phrase-variation', sourceChannelId: 'm' });
    expect(channelsForPlaybackStep(next, 20)[0].channels[0].notes).toEqual(notes);
    const again = withNextPhrase(next, 'm', nextPhrase(phrase, C, 'twist', 1), 'Melody · Twist');
    expect(again.arrangement.at(-1)!.startStep).toBe(32);
  });
});
