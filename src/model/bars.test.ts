import { describe, expect, it } from 'vitest';
import {
  barFamilies, barNames, barPreview, canDuplicateBar, clearBar, copyBar, doubleLoop, duplicateBar, moveBar, rearrangeBars, setBarName,
} from './bars';
import { setChordRow } from './chordRow';
import { addPattern, createChannel, createProject, setLoopBars, type Project } from './project';

/** Two-bar loop at 1/8: a melody with one note per bar and a drum hit on each bar's first step. */
function twoBars(): Project {
  const base = setLoopBars({ ...createProject('Bars'), noteLength: 8 }, 2);
  const melody = {
    ...createChannel('mel', 'Melody', 'grand-piano', 16),
    notes: [
      { id: 'n1', step: 0, pitch: 60, durationSteps: 4 },
      { id: 'n2', step: 10, pitch: 64, durationSteps: 8 },
    ],
    original: { soundId: 'rec', offsetSec: 0 },
    playOriginal: true,
  };
  const drums = { ...createChannel('kick', 'Kick', 'kick', 16), steps: Array.from({ length: 16 }, (_, step) => step === 0 || step === 12) };
  return { ...base, channels: [melody, drums] };
}

describe('bars', () => {
  it('moves bars with all their events and turns off the original recording', () => {
    const moved = moveBar(twoBars(), 0, 1);
    const melody = moved.channels[0];
    expect(melody.notes.map((note) => [note.id, note.step, note.pitch])).toEqual([['n2', 2, 64], ['n1', 8, 60]]);
    // A note keeps its length inside the loop.
    expect(melody.notes[0].durationSteps).toBe(8);
    expect(melody.playOriginal).toBe(false);
    expect(moved.channels[1].steps.flatMap((on, step) => on ? [step] : [])).toEqual([4, 8]);
  });

  it('copies, clears and keeps ids unique', () => {
    const copied = copyBar(twoBars(), 0, 1);
    expect(copied.channels[0].notes.map((note) => [note.id, note.step])).toEqual([['n1', 0], ['n1~b1', 8]]);
    expect(copied.channels[0].playOriginal).toBe(false);
    const cleared = clearBar(twoBars(), 1);
    expect(cleared.channels[0].notes.map((note) => note.id)).toEqual(['n1']);
    expect(cleared.channels[1].steps.filter(Boolean)).toHaveLength(1);
  });

  it('doubles the loop and keeps the original playing in its own bars', () => {
    const doubled = doubleLoop(twoBars());
    expect(doubled.loopBars).toBe(4);
    expect(doubled.channels[0].notes.map((note) => note.step)).toEqual([0, 10, 16, 26]);
    expect(doubled.channels[0].playOriginal).toBe(true);
    expect(doubleLoop(doubled)).toBe(doubled);
  });

  it('duplicates a bar into the next free slot of a 1, 2 or 4 bar loop', () => {
    const p = twoBars();
    const dup = duplicateBar(p, 0);
    expect(dup.loopBars).toBe(4);
    expect(barFamilies(dup)).toEqual(['A', 'A', 'B', '–']);
    expect(canDuplicateBar(dup, 0)).toBe(true);
    const full = duplicateBar(dup, 2);
    expect(barFamilies(full)).toEqual(['A', 'A', 'B', 'B']);
    expect(canDuplicateBar(full, 0)).toBe(false);
  });

  it('names follow their bars and are kept per pattern', () => {
    let p = setBarName(setBarName(twoBars(), 0, 'Call'), 1, 'Answer');
    p = moveBar(p, 0, 1);
    expect(barNames(p)).toEqual(['Answer', 'Call']);
    const other = addPattern(p, 'B');
    expect(barNames(other)).toEqual(['', '']);
  });

  it('marks similar bars with a prime', () => {
    const p = twoBars();
    const near = {
      ...p,
      channels: [
        { ...p.channels[0], notes: [{ id: 'a', step: 0, pitch: 60, durationSteps: 2 }, { id: 'b', step: 8, pitch: 60, durationSteps: 2 }] },
        { ...p.channels[1], steps: Array.from({ length: 16 }, (_, step) => step === 0 || step === 4 || step === 8) },
      ],
    };
    expect(barFamilies(near)).toEqual(['A', 'A′']);
  });

  it('guitar chord rows follow their bars', () => {
    let p = twoBars();
    p = { ...p, channels: [...p.channels, createChannel('gtr', 'Guitar', 'nylon-chords', 16)] };
    p = setChordRow(p, 'gtr', { chords: 'C G', pattern: 'quarters', strumMs: 30, humanise: 0, capo: 0 });
    const moved = moveBar(p, 0, 1);
    expect(moved.channels[2].chordRow?.chords).toBe('G | C');
    const roots = (project: Project) => (project.channels[2].chordEvents ?? []).filter((event) => event.step % 8 === 0).map((event) => event.root % 12);
    expect(roots(moved)).toEqual([7, 0]);
    const dup = duplicateBar(p, 0);
    expect(dup.channels[2].chordRow?.chords).toBe('C | C | G | G');
  });

  it('previews one bar as a one-bar loop without the arrangement', () => {
    const preview = barPreview({ ...twoBars(), arrangement: [{ id: 'c', patternId: 'x', startStep: 0, lengthSteps: 16 }] }, 1);
    expect(preview.loopBars).toBe(1);
    expect(preview.arrangement).toEqual([]);
    expect(preview.channels[0].notes.map((note) => note.step)).toEqual([2]);
    expect(preview.channels[0].playOriginal).toBe(false);
  });

  it('rejects loop lengths other than 1, 2 or 4', () => {
    const p = twoBars();
    expect(rearrangeBars(p, [0, 1, 0])).toBe(p);
  });
});

describe('bar variations', () => {
  it('inserts an Answer after the bar: same rhythm, new notes, drums copied, family A′', async () => {
    const { varyBar, canVaryBar } = await import('./bars');
    const base = setLoopBars({ ...createProject('Vary'), noteLength: 8 }, 2);
    const p: Project = {
      ...base,
      channels: [
        { ...createChannel('mel', 'Melody', 'grand-piano', 16), notes: [60, 62, 64, 67].map((pitch, index) => ({ id: `m${index}`, step: index * 2, pitch, durationSteps: 2 })) },
        { ...createChannel('kick', 'Kick', 'kick', 16), steps: Array.from({ length: 16 }, (_, step) => step % 4 === 0 && step < 8) },
      ],
    };
    expect(canVaryBar(p, 0)).toBe(true);
    expect(canVaryBar(p, 1)).toBe(false);
    const varied = varyBar(p, 0, 'answer');
    expect(varied.loopBars).toBe(2);
    const second = varied.channels[0].notes.filter((note) => note.step >= 8);
    expect(second.map((note) => note.step)).toEqual([8, 10, 12, 14]);
    expect(second.map((note) => note.pitch)).not.toEqual([60, 62, 64, 67]);
    expect(new Set(varied.channels[0].notes.map((note) => note.id)).size).toBe(8);
    expect(varied.channels[1].steps.flatMap((on, step) => on ? [step] : [])).toEqual([0, 4, 8, 12]);
    expect(barFamilies(varied)).toEqual(['A', 'A′']);
  });
});
