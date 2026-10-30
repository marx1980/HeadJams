import { describe, expect, it } from 'vitest';
import { canPaste, copyTrack, copyTrackTo, gridCells, lengthOptions, pasteTrack, setTrackLength, setTrackView, trackLengthId, trackView } from './trackPattern';
import { clearTrackBar, copyTrackBar, fillTrackFromBar } from './bars';
import { createChannel, createProject, setLoopBars, setNoteLength, type Project } from './project';
import { compileStep } from '../audio/performance';
import { addKitChannel, findDrumKit } from '../library/drumKits';
import { normalizeProject } from './storage';

const on = (steps: boolean[]) => steps.flatMap((value, step) => value ? [step] : []);

function project(): Project {
  const p = setLoopBars({ ...createProject(), noteLength: 8 }, 4);
  return { ...p, channels: [
    { ...createChannel('hat', 'Hat', 'hat-1', 32), steps: Array.from({ length: 32 }, (_, step) => step < 8 && step % 2 === 0) },
    { ...createChannel('kick', 'Kick', 'kick-1', 32), steps: Array.from({ length: 32 }, () => false) },
    { ...createChannel('mel', 'Melody', 'grand-piano', 32), notes: [{ id: 'a', step: 1, pitch: 60, durationSteps: 2 }] },
  ] };
}

describe('track bar tools', () => {
  it('fills, copies and clears one track only', () => {
    const p = project();
    const filled = fillTrackFromBar(p, 'hat', 0);
    expect(on(filled.channels[0].steps)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]);
    expect(filled.channels[2].notes).toEqual(p.channels[2].notes);
    expect(on(copyTrackBar(p, 'hat', 0, 2).channels[0].steps)).toEqual([0, 2, 4, 6, 16, 18, 20, 22]);
    expect(on(clearTrackBar(filled, 'hat', 1).channels[0].steps)).toHaveLength(12);
    expect(fillTrackFromBar(p, 'mel', 0).channels[2].notes.map((note) => note.step)).toEqual([1, 9, 17, 25]);
  });
});

describe('track length', () => {
  it('repeats a short grid across the loop in playback and keeps the rest', () => {
    const p = setTrackLength(project(), 'hat', 'bar');
    expect(p.channels[0].lengthSteps).toBe(8);
    expect(trackLengthId(p, p.channels[0])).toBe('bar');
    const hits = (step: number) => compileStep(p, step, (steps) => steps * 0.1).filter((voice) => voice.channelId === 'hat').length;
    expect([hits(0), hits(8), hits(10), hits(25)]).toEqual([1, 1, 1, 0]);
    expect(setTrackLength(p, 'hat', 'loop').channels[0].lengthSteps).toBeUndefined();
    expect(setTrackLength(project(), 'mel', 'bar')).toEqual(project());
    expect(lengthOptions(p).map((item) => item.id)).toEqual(['half', 'bar', 'two', 'loop']);
    expect(lengthOptions(setLoopBars(p, 1)).map((item) => item.id)).toEqual(['half', 'loop']);
  });

  it('follows grid and loop changes, and survives saving', () => {
    const p = setTrackLength(project(), 'hat', 'bar');
    expect(setNoteLength(p, 16).channels[0].lengthSteps).toBe(16);
    expect(setLoopBars(p, 1).channels[0].lengthSteps).toBeUndefined();
    const reloaded = normalizeProject(JSON.stringify(setTrackView(p, 'hat', 4)))!;
    expect(reloaded.channels[0].lengthSteps).toBe(8);
    expect(reloaded.channels[0].viewSteps).toBe(4);
    const broken = normalizeProject(JSON.stringify({ ...p, channels: [{ ...p.channels[0], lengthSteps: 7, viewSteps: 16 }] }))!;
    expect(broken.channels[0].lengthSteps).toBeUndefined();
    expect(broken.channels[0].viewSteps).toBeUndefined();
  });

  it('works for kit lanes', () => {
    const base = addKitChannel(setLoopBars({ ...createProject(), channels: [] }, 2), findDrumKit('acoustic-kit')!);
    const id = base.channels[0].id;
    const withKick = { ...base, channels: [{ ...base.channels[0], lanes: base.channels[0].lanes!.map((lane) => lane.id === 'kick' ? { ...lane, steps: lane.steps.map((_, step) => step === 0) } : lane) }] };
    const short = setTrackLength(withKick, id, 'bar');
    expect(compileStep(short, 16, () => 0.1).length).toBe(1);
  });
});

describe('track steps view', () => {
  it('shows coarser cells and marks hits between them', () => {
    const p = setTrackView(project(), 'hat', 4);
    expect(trackView(p, p.channels[0])).toBe(4);
    const cells = gridCells([true, true, false, false, false, false, true, false], 8, 8, 4);
    expect(cells).toEqual([
      { step: 0, on: true, hidden: true }, { step: 2, on: false, hidden: false },
      { step: 4, on: false, hidden: false }, { step: 6, on: true, hidden: false },
    ]);
    expect(setTrackView(p, 'hat', 8).channels[0].viewSteps).toBeUndefined();
  });
});

describe('copy and paste', () => {
  it('copies a short pattern onto another track, repeated', () => {
    let p = setTrackLength(project(), 'hat', 'bar');
    p = copyTrackTo(p, 'hat', 'kick');
    expect(on(p.channels[1].steps)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]);
  });

  it('converts between grids', () => {
    const clip = copyTrack(setTrackLength(project(), 'hat', 'bar'), 'hat')!;
    const at16 = setNoteLength(project(), 16);
    expect(on(pasteTrack(at16, 'kick', clip).channels[1].steps).slice(0, 4)).toEqual([0, 4, 8, 12]);
  });

  it('pastes only where it fits', () => {
    const p = project();
    const hits = copyTrack(p, 'hat');
    const notes = copyTrack(p, 'mel')!;
    expect(canPaste(hits, p.channels[2])).toBe(false);
    expect(canPaste(notes, p.channels[1])).toBe(true);
    const pasted = pasteTrack(setLoopBars(p, 4), 'kick', { ...notes, length: 8 });
    expect(pasted.channels[1].notes.map((note) => note.step)).toEqual([1, 9, 17, 25]);
    expect(new Set(pasted.channels[1].notes.map((note) => note.id)).size).toBe(4);
  });
});
