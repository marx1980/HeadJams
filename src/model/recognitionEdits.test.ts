import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addChannel, createProject, setLoopBars, updateChannel, type Project } from './project';
import { applyRecognitionTake, createRecognitionTake } from './recognitionProject';
import type { RecognitionResult, RecognitionTake } from './recognition';
import { loadProject, saveProject } from './storage';

// 120 BPM, 16 steps per bar: one step = 0.125 s.
const note = (id: string, pitch: number, start: number, duration = 0.25) => ({
  id, pitch, startSeconds: start, durationSeconds: duration, velocity: 0.8, confidence: 0.9,
});
const melody = (events = [note('a', 60, 0), note('b', 62, 0.5), note('c', 64, 1)]): RecognitionResult => ({
  mode: 'melody', modelId: 'test', modelVersion: '1', events, tempoAlternatives: [],
});
const hit = (id: string, type: 'kick' | 'snare' | 'clap', start: number) => ({ id, type, startSeconds: start, velocity: 1, confidence: 0.8 });
const beat = (events = [hit('k1', 'kick', 0), hit('k2', 'kick', 1), hit('s1', 'snare', 0.5)]): RecognitionResult => ({
  mode: 'beat', modelId: 'test', modelVersion: '1', events, tempoAlternatives: [],
});
const exact = { enabled: true, strength: 1, subdivision: 'sixteenth' as const };

function setup(result: RecognitionResult, project: Project = createProject()) {
  const take = createRecognitionTake('sample-1', result, exact, 120, 16, 'take-1');
  const applied = applyRecognitionTake(project, take)!;
  const saved = applied.recognitionTakes.find((t) => t.id === 'take-1')!;
  return { project: applied, take: saved };
}
const shifted = (take: RecognitionTake, seconds: number): RecognitionTake => ({
  ...take, quantisedEvents: take.quantisedEvents.map((event) => ({ ...event, startSeconds: event.startSeconds + seconds })),
});
const trackOf = (project: Project, take: RecognitionTake, index = 0) =>
  project.channels.find((channel) => channel.id === take.channelIds[index])!;

describe('grid edits survive recognition corrections', () => {
  it('keeps moved, deleted and added notes and the track settings when the take is re-applied', () => {
    const { project, take } = setup(melody());
    const track = trackOf(project, take);
    const edited = updateChannel(project, track.id, {
      soundId: 'bass-1', volume: 0.3, pan: -0.5, mute: true, name: 'My tune',
      notes: [
        { ...track.notes.find((n) => n.id === 'a')!, step: 3 },          // moved by the user
        track.notes.find((n) => n.id === 'c')!,                          // untouched ("b" deleted)
        { id: 'mine', step: 12, pitch: 67, durationSteps: 2 },           // added by the user
      ],
    });
    const after = applyRecognitionTake(edited, shifted(take, 0.25))!;
    const updated = trackOf(after, take);
    expect(updated).toMatchObject({ id: track.id, soundId: 'bass-1', volume: 0.3, pan: -0.5, mute: true, name: 'My tune' });
    const byId = Object.fromEntries(updated.notes.map((n) => [n.id, n]));
    expect(byId.a.step).toBe(3);
    expect(byId.b).toBeUndefined();
    expect(byId.c.step).toBe(10);
    expect(byId.mine.step).toBe(12);
    expect(after.channels).toHaveLength(edited.channels.length);
  });

  it('keeps user edits through repeated corrections', () => {
    const { project, take } = setup(melody());
    const track = trackOf(project, take);
    const edited = updateChannel(project, track.id, { notes: track.notes.map((n) => n.id === 'a' ? { ...n, pitch: 65 } : n) });
    const once = applyRecognitionTake(edited, shifted(take, 0.25))!;
    const twice = applyRecognitionTake(once, shifted(take, 0.5))!;
    const notes = Object.fromEntries(trackOf(twice, take).notes.map((n) => [n.id, n]));
    expect(notes.a).toMatchObject({ pitch: 65, step: 0 });
    expect(notes.b.step).toBe(8);
  });

  it('resets the recognised notes on request but never removes notes the user added', () => {
    const { project, take } = setup(melody());
    const track = trackOf(project, take);
    const edited = updateChannel(project, track.id, {
      notes: [{ ...track.notes[0], step: 7 }, { id: 'mine', step: 12, pitch: 67, durationSteps: 2 }],
    });
    const reset = applyRecognitionTake(edited, take, undefined, { discardEdits: true })!;
    const notes = trackOf(reset, take).notes;
    expect(notes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c', 'mine']);
    expect(notes.find((n) => n.id === 'a')!.step).toBe(0);
  });

  it('treats takes saved before this change as unedited, without resetting track settings', () => {
    const { project, take } = setup(melody());
    const legacy = { ...project, recognitionTakes: project.recognitionTakes.map(({ applied: _applied, ...rest }) => rest) };
    const track = trackOf(project, take);
    const tweaked = updateChannel(legacy, track.id, { volume: 0.2 });
    const after = applyRecognitionTake(tweaked, shifted(take, 0.25))!;
    expect(trackOf(after, take)).toMatchObject({ id: track.id, volume: 0.2 });
    expect(trackOf(after, take).notes.map((n) => n.step).sort((a, b) => a - b)).toEqual([2, 6, 10]);
  });

  it('keeps beat-grid edits per step and moves only untouched hits', () => {
    const { project, take } = setup(beat());
    const kick = trackOf(project, take, 0);
    const snare = trackOf(project, take, 1);
    let edited = updateChannel(project, kick.id, { steps: kick.steps.map((on, i) => (i === 5 ? true : on)), volume: 0.4 });
    edited = updateChannel(edited, snare.id, { steps: snare.steps.map(() => false) }); // user cleared the snare hit
    const after = applyRecognitionTake(edited, shifted(take, 0.125))!;
    const kickAfter = trackOf(after, take, 0);
    expect(kickAfter.volume).toBe(0.4);
    expect(kickAfter.steps.flatMap((on, i) => (on ? [i] : []))).toEqual([1, 5, 9]);
    expect(trackOf(after, take, 1).steps.some(Boolean)).toBe(false);
  });

  it('moves a reclassified hit to its new track and removes an emptied, untouched track', () => {
    const { project, take } = setup(beat());
    const reclassified = { ...take, quantisedEvents: take.quantisedEvents.map((e) => e.id === 's1' ? { ...e, type: 'clap' as const } : e) };
    const after = applyRecognitionTake(project, reclassified)!;
    const names = after.channels.map((channel) => channel.name);
    expect(names).toContain('Recognized Clap');
    expect(names).not.toContain('Recognized Snare');
  });

  it('can re-apply a correction when all channels are in use', () => {
    let { project, take } = setup(melody());
    while (project.channels.length < 8) project = addChannel(project, 'Filler', 'kick-1');
    expect(applyRecognitionTake(project, shifted(take, 0.25))).toBeDefined();
  });
});

describe('recording never shrinks the project', () => {
  it('grows the loop to fit a longer take and keeps existing content', () => {
    let project = createProject();
    project = updateChannel(project, 'ch1', { steps: project.channels[0].steps.map((_, i) => i === 4) });
    const { project: after } = setup(melody([note('a', 60, 0), note('z', 60, 3.6)]), project);
    expect(after.loopBars).toBe(2);
    expect(after.channels[0].steps[4]).toBe(true);
  });

  it('does not shorten a longer project when applying a short take', () => {
    let project = setLoopBars(createProject(), 4);
    project = updateChannel(project, 'ch1', { steps: project.channels[0].steps.map((_, i) => i === 60) });
    const { project: after } = setup(melody([note('a', 60, 0)]), project);
    expect(after.loopBars).toBe(4);
    expect(after.channels[0].steps[60]).toBe(true);
  });
});

describe('applied snapshot storage', () => {
  const values = new Map<string, string>();
  beforeEach(() => {
    values.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) },
    });
  });
  afterEach(() => { delete (globalThis as { localStorage?: Storage }).localStorage; });

  it('survives save and reload', () => {
    const { project } = setup(melody());
    saveProject(project);
    const loaded = loadProject();
    expect(loaded.recognitionTakes[0].applied).toEqual(project.recognitionTakes[0].applied);
  });
});

describe('idea fields', () => {
  const values = new Map<string, string>();
  beforeEach(() => {
    values.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) },
    });
  });
  afterEach(() => { delete (globalThis as { localStorage?: Storage }).localStorage; });

  it('keeps source, label and alignment through save and reload, and drops invalid values', () => {
    const { project } = setup(melody());
    const take = { ...project.recognitionTakes[0], source: 'mic' as const, label: '  Melody 1 ', alignmentSeconds: 0.04 };
    saveProject({ ...project, recognitionTakes: [take] });
    expect(loadProject().recognitionTakes[0]).toMatchObject({ source: 'mic', label: 'Melody 1', alignmentSeconds: 0.04 });
    saveProject({ ...project, recognitionTakes: [{ ...take, source: 'radio' as never, label: '' }] });
    const loaded = loadProject().recognitionTakes[0];
    expect(loaded.source).toBeUndefined();
    expect(loaded.label).toBeUndefined();
  });
});

describe('capture into an existing channel', () => {
  it('adds the hummed notes next to the channel\'s own notes and removes only them when the idea is deleted', async () => {
    const { removeRecognitionTake } = await import('./recognitionProject');
    let project = createProject();
    project = updateChannel(project, 'ch1', { soundId: 'bass-1', name: 'My bass', notes: [{ id: 'own', step: 4, pitch: 40, durationSteps: 2 }] });
    const take = { ...createRecognitionTake('sample-1', melody(), exact, 120, 16, 'take-1'), targetChannelId: 'ch1' };
    const applied = applyRecognitionTake(project, take)!;
    expect(applied.channels).toHaveLength(1);
    const channel = applied.channels[0];
    expect(channel).toMatchObject({ soundId: 'bass-1', name: 'My bass', original: { soundId: 'recognition-original-take-1' } });
    expect(channel.notes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c', 'own']);
    const removed = removeRecognitionTake(applied, 'take-1');
    expect(removed.channels).toHaveLength(1);
    expect(removed.channels[0].notes.map((n) => n.id)).toEqual(['own']);
    expect(removed.channels[0].original).toBeUndefined();
  });
});
