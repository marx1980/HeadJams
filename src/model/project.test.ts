import { describe, expect, it } from 'vitest';
import {
  addArrangementClip, addChannel, addCustomSound, addNote, addPattern, addSampleSound, arrangementLength, audibleChannels,
  channelsForPlaybackStep, createChannel, createProject, removeChannel, removeNote, removePattern, selectPattern,
  setBpm, setLoopBars, setNoteLength, setScale, toggleStep, totalSteps, MAX_CHANNELS,
} from './project';
import { TEMPLATES } from './templates';

describe('project model', () => {
  it('toggles a step', () => {
    expect(toggleStep(createProject(), 'ch1', 3).channels[0].steps[3]).toBe(true);
  });
  it('resizes steps when loop length changes, keeping content', () => {
    const p = setLoopBars(toggleStep(createProject(), 'ch1', 2), 2);
    expect(p.channels[0].steps).toHaveLength(32);
    expect(p.channels[0].steps[2]).toBe(true);
  });
  it('honours solo and mute', () => {
    const p = createProject();
    p.channels.push({ ...createChannel('ch2', 'Snare', 'snare-1'), solo: true });
    expect(audibleChannels(p).map((c) => c.id)).toEqual(['ch2']);
  });
  it('changes note length keeping notes that fit the grid', () => {
    let p = toggleStep(toggleStep(createProject(), 'ch1', 0), 'ch1', 4);
    p = setNoteLength(p, 4);
    expect(p.channels[0].steps).toEqual([true, true, false, false]);
    p = setNoteLength(p, 16);
    expect(p.channels[0].steps).toHaveLength(16);
    expect(p.channels[0].steps[0] && p.channels[0].steps[4]).toBe(true);
    expect(totalSteps(setLoopBars(p, 4))).toBe(64);
  });
  it('adds/removes channels with a cap and unique ids', () => {
    let p = createProject();
    for (let i = 0; i < 12; i++) p = addChannel(p, 'x', 'kick-1');
    expect(p.channels).toHaveLength(MAX_CHANNELS);
    p = removeChannel(p, 'ch1');
    p = addChannel(p, 'y', 'kick-1');
    expect(new Set(p.channels.map((c) => c.id)).size).toBe(p.channels.length);
  });
  it('clamps bpm', () => {
    expect(setBpm(createProject(), 999).bpm).toBe(200);
    expect(setBpm(createProject(), 1).bpm).toBe(40);
  });
  it('adds custom sounds', () => {
    const { project, sound } = addCustomSound(createProject(), ' ', { wave: 'sine', freq: 100, freqEnd: 50, decay: 0.2, cutoff: 1000 });
    expect(project.customSounds).toEqual([sound]);
    expect(sound.name).toBe('My sound');
  });
  it('stores sample metadata separately from sample audio', () => {
    const project = addSampleSound(createProject(), 'Field recording', 'sample-1', ['field', 'outdoor']);
    expect(project.customSounds[0]).toMatchObject({
      name: 'Field recording', category: 'Samples', sampleId: 'sample-1', tags: ['field', 'outdoor'],
    });
  });
  it('stores pitch events and keeps them synchronized in the active pattern', () => {
    let p = addPattern(createProject(), 'Verse');
    const patternId = p.currentPatternId!;
    p = addNote(p, 'ch1', { id: 'note-1', step: 2, pitch: 60, durationSteps: 2, velocity: 0.8 });
    expect(p.channels[0].notes[0]).toMatchObject({ pitch: 60, durationSteps: 2 });
    expect(p.patterns[0].channels[0].notes).toEqual(p.channels[0].notes);
    p = removeNote(p, 'ch1', 'note-1');
    expect(p.patterns[0].channels[0].notes).toEqual([]);
    expect(p.currentPatternId).toBe(patternId);
  });
  it('switches patterns and persists edits without sharing channel arrays', () => {
    let p = toggleStep(addPattern(createProject(), 'Verse'), 'ch1', 0);
    p = addPattern(p, 'Chorus');
    expect(p.channels[0].steps[0]).toBe(true);
    p = toggleStep(p, 'ch1', 1);
    p = selectPattern(p, 'pattern-1');
    expect(p.channels[0].steps[0]).toBe(false);
    p = selectPattern(p, 'pattern-2');
    expect(p.channels[0].steps.slice(0, 2)).toEqual([true, true]);
    expect(p.patterns[0].channels[0].steps).not.toBe(p.patterns[1].channels[0].steps);
  });
  it('schedules arrangement clips across their repeated pattern length', () => {
    let p = addPattern(toggleStep(createProject(), 'ch1', 0), 'Verse');
    p = addArrangementClip(p, p.patterns[0].id, 4, 8);
    expect(arrangementLength(p)).toBe(12);
    expect(channelsForPlaybackStep(p, 3)).toEqual([]);
    expect(channelsForPlaybackStep(p, 4)[0].localStep).toBe(0);
    expect(channelsForPlaybackStep(p, 7)[0].localStep).toBe(3);
    expect(channelsForPlaybackStep(p, 8)[0].localStep).toBe(4);
    expect(removePattern(p, p.patterns[0].id).arrangement).toEqual([]);
  });
  it('stores a normalized scale root and scale id', () => {
    expect(setScale(createProject(), -1, 'minor')).toMatchObject({ scaleRoot: 11, scaleId: 'minor' });
  });
  it('templates are consistent', () => {
    for (const t of TEMPLATES) {
      const p = t.make();
      expect(p.channels.every((c) => c.steps.length === totalSteps(p))).toBe(true);
    }
  });
});
