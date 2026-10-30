import { describe, expect, it } from 'vitest';
import { createChannel, createProject, setLoopBars, type Project } from './project';
import {
  bpmAtStep, durationAt, hasTempoMap, moveTempoChange, nextFreeTempoBar, normalizeTempoChanges, removeTempoChange, setTempoChange,
  songSeconds, stepAtSeconds, stepSeconds, stepStartSeconds,
} from './tempo';
import { stepDurationWithSwing } from '../audio/scheduler';
import { renderProject } from '../audio/render';

const fourBars = (): Project => setLoopBars({ ...createProject('Tempo'), bpm: 100, noteLength: 4 }, 4);

describe('tempo map', () => {
  it('without changes gives exactly the old step arithmetic', () => {
    const p = { ...fourBars(), swingTemplate: 'straight' as const };
    expect(hasTempoMap(p)).toBe(false);
    for (let step = 0; step < 16; step++) expect(stepSeconds(p, step)).toBe(stepDurationWithSwing(100, 4, 'straight', step));
    expect(songSeconds(p)).toBeCloseTo(9.6, 9);
  });

  it('changes tempo at the start of a bar', () => {
    const p = setTempoChange(fourBars(), 2, 200);
    expect(bpmAtStep(p, 7)).toBe(100);
    expect(bpmAtStep(p, 8)).toBe(200);
    // Two bars at 100 BPM (2.4 s each) and two at 200 BPM (1.2 s each).
    expect(songSeconds(p)).toBeCloseTo(7.2, 9);
    expect(stepStartSeconds(p, 8)).toBeCloseTo(4.8, 9);
    expect(stepAtSeconds(p, 4.8 + 0.15)).toBeCloseTo(8.5, 9);
  });

  it('glides over the chosen bars and reaches the new tempo on the last step', () => {
    const p = setTempoChange(fourBars(), 1, 60, 2);
    expect(bpmAtStep(p, 3)).toBe(100);
    expect(bpmAtStep(p, 4)).toBeCloseTo(95, 9);
    expect(bpmAtStep(p, 11)).toBeCloseTo(60, 9);
    expect(bpmAtStep(p, 12)).toBe(60);
  });

  it('note lengths follow the tempo they play in', () => {
    const p = setTempoChange(fourBars(), 1, 200);
    // One beat at 100 (0.6 s) then one at 200 (0.3 s).
    expect(durationAt(p, 3, 2)).toBeCloseTo(0.9, 9);
    expect(durationAt(fourBars(), 3, 2)).toBeCloseTo(1.2, 9);
  });

  it('edits: keep inside the song, one per bar, clamp tempo, move and remove', () => {
    let p = setTempoChange(fourBars(), 2, 500);
    expect(p.tempoChanges).toEqual([{ bar: 2, bpm: 200 }]);
    expect(setTempoChange(p, 0, 120)).toBe(p);
    expect(setTempoChange(p, 4, 120)).toBe(p);
    p = setTempoChange(p, 2, 90, 1);
    expect(p.tempoChanges).toEqual([{ bar: 2, bpm: 90, glideBars: 1 }]);
    expect(nextFreeTempoBar(p)).toBe(3);
    p = moveTempoChange(p, 2, 3);
    expect(p.tempoChanges).toEqual([{ bar: 3, bpm: 90, glideBars: 1 }]);
    p = removeTempoChange(p, 3);
    expect(p.tempoChanges).toBeUndefined();
  });

  it('ignores changes past the end of the song', () => {
    const p = { ...fourBars(), tempoChanges: [{ bar: 9, bpm: 60 }] };
    expect(hasTempoMap(p)).toBe(false);
  });

  it('loads only valid changes', () => {
    expect(normalizeTempoChanges([{ bar: 2, bpm: 300, glideBars: 3 }, { bar: 0, bpm: 90 }, 'x', { bar: 1, bpm: 70, glideBars: 2 }]))
      .toEqual([{ bar: 1, bpm: 70, glideBars: 2 }, { bar: 2, bpm: 200 }]);
    expect(normalizeTempoChanges([])).toBeUndefined();
  });

  it('export follows the tempo map', () => {
    const base = fourBars();
    const p: Project = { ...base, channels: [{ ...createChannel('k', 'Kick', 'kick-1', 16), steps: Array.from({ length: 16 }, () => true) }] };
    const sr = 8000;
    const plain = renderProject(p, sr);
    const faster = renderProject(setTempoChange(p, 2, 200), sr);
    expect(plain.left.length - faster.left.length).toBe(Math.round(9.6 * sr) - Math.round(7.2 * sr));
    // The hit on the first step of bar 3 starts at 4.8 s.
    const onset = (data: Float32Array, from: number) => { for (let i = from; i < data.length; i++) if (Math.abs(data[i]) > 1e-4) return i; return -1; };
    expect(onset(faster.left, Math.round(4.75 * sr))).toBe(Math.round(4.8 * sr));
  });
});
