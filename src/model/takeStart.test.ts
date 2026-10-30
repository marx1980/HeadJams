import { describe, expect, it } from 'vitest';
import { createProject, setLoopBars } from './project';
import { applyRecognitionTake, createRecognitionTake } from './recognitionProject';
import { shiftTakeStart } from './takeStart';
import type { RecognitionResult } from './recognition';
import { compileStep } from '../audio/performance';

// 120 BPM, 1/8 grid: one step = 0.25 s; two-bar loop = 4 s.
const result: RecognitionResult = {
  mode: 'melody', modelId: 'test', modelVersion: '1', tempoAlternatives: [],
  events: [
    { id: 'a', pitch: 60, startSeconds: 0.5, durationSeconds: 0.5, velocity: 0.8, confidence: 0.9 },
    { id: 'b', pitch: 64, startSeconds: 1.0, durationSeconds: 0.5, velocity: 0.8, confidence: 0.9 },
  ],
};

function setup() {
  const base = setLoopBars({ ...createProject(), bpm: 120, noteLength: 8 }, 2);
  const take = createRecognitionTake('rec', result, { enabled: true, strength: 1, subdivision: 'eighth' }, 120, 8, 'take', 0, false, 0, 'major', 0.1);
  const project = applyRecognitionTake(base, take)!;
  const trackId = project.recognitionTakes[0].channelIds[0];
  return { project, trackId };
}
const notesOf = (project: ReturnType<typeof setup>['project'], id: string) =>
  project.channels.find((channel) => channel.id === id)!.notes.map((note) => [note.id, note.step]);

describe('take start', () => {
  it('moves notes and the recording together and remembers the shift', () => {
    const { project, trackId } = setup();
    expect(notesOf(project, trackId)).toEqual([['a', 2], ['b', 4]]);
    const earlier = shiftTakeStart(project, 'take', -2);
    expect(notesOf(earlier, trackId)).toEqual([['a', 0], ['b', 2]]);
    expect(earlier.recognitionTakes[0].startShiftSteps).toBe(-2);
    expect(earlier.channels.find((channel) => channel.id === trackId)!.original!.offsetSec).toBeCloseTo(0.1 - 0.5);
    const back = shiftTakeStart(earlier, 'take', 2);
    expect(notesOf(back, trackId)).toEqual([['a', 2], ['b', 4]]);
    expect(back.recognitionTakes[0].startShiftSteps).toBeUndefined();
  });

  it('wraps notes moved before the loop start to its end', () => {
    const { project, trackId } = setup();
    expect(notesOf(shiftTakeStart(project, 'take', -3), trackId)).toEqual([['a', 15], ['b', 1]]);
  });

  it('keeps grid edits', () => {
    const { project, trackId } = setup();
    const edited = {
      ...project,
      channels: project.channels.map((channel) => channel.id === trackId
        ? { ...channel, notes: channel.notes.map((note) => note.id === 'b' ? { ...note, pitch: 67 } : note) } : channel),
    };
    const moved = shiftTakeStart(edited, 'take', 1);
    expect(moved.channels.find((channel) => channel.id === trackId)!.notes.map((note) => [note.id, note.pitch])).toContainEqual(['b', 67]);
  });

  it('plays a recording that started before the loop from the right point', () => {
    const { project, trackId } = setup();
    let earlier = shiftTakeStart(project, 'take', -2);
    earlier = { ...earlier, channels: earlier.channels.map((channel) => channel.id === trackId ? { ...channel, playOriginal: true } : channel) };
    const voice = compileStep(earlier, 0, (steps) => steps * 0.25).find((item) => item.channelId === trackId && item.kind === 'hit');
    expect(voice).toMatchObject({ offsetSec: 0 });
    expect((voice as { skipSec?: number }).skipSec).toBeCloseTo(0.4);
  });
});

describe('capture over one bar', () => {
  it('moves the first pass into the bar and drops the rest', async () => {
    const { confineTakeToBar } = await import('./takeStart');
    const take = createRecognitionTake('rec', {
      ...result,
      events: [
        { id: 'a', pitch: 60, startSeconds: 0.5, durationSeconds: 1.8, velocity: 0.8, confidence: 0.9 },
        { id: 'b', pitch: 64, startSeconds: 2.5, durationSeconds: 0.5, velocity: 0.8, confidence: 0.9 },
      ],
    }, { enabled: true, strength: 1, subdivision: 'eighth' }, 120, 8, 'take');
    const confined = confineTakeToBar(take, 1, 2);
    expect(confined.originalEvents.map((event) => [event.id, event.startSeconds])).toEqual([['a', 2.5]]);
    expect((confined.originalEvents[0] as { durationSeconds: number }).durationSeconds).toBeCloseTo(1.5);
    expect(confined.quantisedEvents.map((event) => event.id)).toEqual(['a']);
    expect(confined.alignmentSeconds).toBe(2);
    const base = setLoopBars({ ...createProject(), bpm: 120, noteLength: 8 }, 2);
    const applied = applyRecognitionTake(base, confined)!;
    expect(applied.loopBars).toBe(2);
    expect(applied.channels.at(-1)!.notes.map((note) => [note.step, note.durationSteps])).toEqual([[10, 6]]);
  });
});
