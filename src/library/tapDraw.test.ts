import { describe, expect, it } from 'vitest';
import { rhythmSteps, rhythmToStrumBar, tapsToRhythm } from './tapRhythm';
import { contourToNotes } from './drawMelody';
import { keyProgression, applyRhythm } from '../model/rhythmUse';
import { createChannel, createProject, setLoopBars } from '../model/project';
import { addKitChannel, findDrumKit } from './drumKits';

// 120 BPM, 16 steps per bar: a step is 125 ms.
const timing = { bpm: 120, stepsPerBar: 16, totalSteps: 16, beatZeroMs: 1000 };

describe('tap rhythm', () => {
  it('snaps taps to the nearest step, folds later passes of the loop, and strengthens repeated steps', () => {
    const taps = [1000, 1255, 1490, 1990, 3000 + 10, 3000 + 495, 3000 + 1000].map((ms) => ({ ms }));
    const rhythm = tapsToRhythm(taps, timing);
    expect(rhythmSteps(rhythm)).toEqual([0, 2, 4, 8]);
    expect(rhythm.hits[0]).toBeGreaterThan(rhythm.hits[2]);
  });

  it('turns a rhythm into a one-bar strum: downs on eighths, ups on sixteenth offbeats', () => {
    const bar = rhythmToStrumBar({ length: 16, hits: { 0: 1, 4: 0.6, 6: 0.6, 7: 0.6, 12: 0.6 } }, 16);
    expect(bar).toBe('D...d.du....d...');
    expect(rhythmToStrumBar({ length: 8, hits: { 0: 1, 3: 0.5 } }, 8)).toBe('D.....d.........');
  });

  it('is used for drums (into a kit lane), bass and pulses (following chords), and strum (a tapped chord row)', () => {
    let p = setLoopBars({ ...createProject('t'), channels: [] }, 1);
    const rhythm = { length: 16, hits: { 0: 1, 6: 0.7, 8: 0.7 } };
    const kit = applyRhythm(p, rhythm, 'kick');
    expect(kit.channels[0].lanes!.find((l) => l.id === 'kick')!.steps.flatMap((on, i) => on ? [i] : [])).toEqual([0, 6, 8]);
    p = addKitChannel(p, findDrumKit('acoustic-kit')!);
    const into = applyRhythm(p, rhythm, 'snare', p.channels[0].id);
    expect(into.channels).toHaveLength(1);
    p = { ...p, scaleRoot: 7 };
    const bass = applyRhythm(p, rhythm, 'bass').channels.at(-1)!;
    expect(bass.soundId).toBe('electric-bass');
    expect(bass.notes.map((n) => [n.step, n.pitch % 12, n.durationSteps])).toEqual([[0, 7, 6], [6, 7, 2], [8, 7, 8]]);
    const chords = { ...p, channels: [...p.channels, { ...createChannel('g', 'Guitar', 'nylon-chords', 16), chordEvents: [
      { id: 'c', step: 0, root: 57, quality: 'minor' as const, articulation: 'down-strum' as const, durationSteps: 16 }] }] };
    const pulses = applyRhythm(chords, rhythm, 'pulses').channels.at(-1)!;
    expect(pulses.notes.filter((n) => n.step === 0).map((n) => n.pitch)).toEqual([69, 72, 76]);
    const strum = applyRhythm(p, rhythm, 'strum').channels.at(-1)!;
    expect(strum.chordRow).toMatchObject({ pattern: 'custom', customBar: 'D.....d.d.......', chords: keyProgression(p) });
    expect(strum.chordEvents!.map((e) => e.step)).toEqual([0, 6, 8]);
  });
});

describe('draw melody', () => {
  const key = { root: 0, scaleId: 'major' };
  const line = (points: [number, number][]) => points.map(([x, y]) => ({ x, y }));

  it('turns a contour into notes; Cleaned snaps to the key and drops blips; Tight lands on eighths', () => {
    const stroke = line([[0, 60.2], [3.9, 60.1], [4, 63.4], [4.9, 63.4], [5, 64.2], [7.9, 64], [8, 61.2], [8.9, 61.2], [9, 67], [11.9, 67]]);
    const original = contourToNotes([stroke], 16, 'original', key);
    expect(original.map((n) => [n.step, n.pitch, n.durationSteps])).toEqual([[0, 60, 4], [4, 63, 1], [5, 64, 3], [8, 61, 1], [9, 67, 3]]);
    const cleaned = contourToNotes([stroke], 16, 'cleaned', key);
    expect(cleaned.every((n) => [0, 2, 4, 5, 7, 9, 11].includes(n.pitch % 12))).toBe(true);
    expect(cleaned.map((n) => n.pitch)).toEqual([60, 64, 67]);
    const tight = contourToNotes([stroke], 16, 'tight', key);
    expect(tight.every((n) => n.step % 2 === 0 && n.durationSteps % 2 === 0)).toBe(true);
    expect(tight.map((n) => n.pitch)).toEqual([60, 64, 67]);
  });

  it('fills steps a fast stroke jumps over, and separate strokes leave rests', () => {
    const notes = contourToNotes([line([[0, 60], [6, 60]]), line([[10, 65], [12, 65]])], 16, 'original', key);
    expect(notes.map((n) => [n.step, n.durationSteps])).toEqual([[0, 7], [10, 3]]);
  });
});
