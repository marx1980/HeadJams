import { describe, expect, it } from 'vitest';
import {
  addArrangementClip, addChannel, addChordEvent, addCustomSound, addNote, addPattern, addSampleSound, arrangementLength, audibleChannels,
  channelsForPlaybackStep, createChannel, createProject, removeArrangementClip, removeChannel, removeNote, removePattern, selectPattern,
  scaleChannelNoteDurations, setBpm, setEffects, setLoopBars, setNoteLength, setScale, setSwingTemplate, shiftChannelNotes,
  removeChordEvent, setStepEventMetadata, toggleStep, totalSteps, transposeChannelNotes, MAX_CHANNELS,
} from './project';
import { addGeneratedChordChannel, removeGeneratedChordChannel, replaceGeneratedChordChannel } from './arrangement';
import { TEMPLATES } from './templates';
import { suggestChordsFromNotes } from '../library/chordSuggestion';

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
  it('stores bounded effects settings with neutral defaults', () => {
    expect(createProject().effects).toEqual({ reverb: 0, delay: 0, filterCutoff: 20000, eqLow: 0, eqMid: 0, eqHigh: 0 });
    expect(setEffects(createProject(), { reverb: 2, filterCutoff: 30, eqMid: -20 }).effects)
      .toMatchObject({ reverb: 1, filterCutoff: 200, eqMid: -12 });
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
      assetSource: 'user-sample', assetAttribution: 'User-provided audio', assetLicense: 'Not verified by MusicMaker',
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
  it('preserves recognition metadata across notes, pattern copies, and step resizing', () => {
    let p = addPattern(createProject(), 'Recognised');
    p = addNote(p, 'ch1', {
      id: 'note-recognised', step: 2, pitch: 60, durationSteps: 2, confidence: 0.4,
      pitchBend: [{ time: 0, value: 0 }, { time: 0.2, value: 0.5 }], sourceTakeId: 'take-1',
    });
    p = toggleStep(p, 'ch1', 2);
    p = setStepEventMetadata(p, 'ch1', 2, { confidence: 0.3, sourceTakeId: 'take-1' });

    expect(p.channels[0].notes[0]).toMatchObject({
      confidence: 0.4, pitchBend: [{ time: 0, value: 0 }, { time: 0.2, value: 0.5 }], sourceTakeId: 'take-1',
    });
    expect(p.patterns[0].channels[0].stepEventMetadata?.[2]).toEqual({ confidence: 0.3, sourceTakeId: 'take-1' });
    expect(setNoteLength(p, 8).channels[0].stepEventMetadata?.[1]).toEqual({ confidence: 0.3, sourceTakeId: 'take-1' });
    expect(setLoopBars(p, 1).channels[0].stepEventMetadata?.[2]).toEqual({ confidence: 0.3, sourceTakeId: 'take-1' });
  });
  it('bounds recognition confidence, rejects invalid bend points, and ignores invalid step metadata positions', () => {
    let p = addNote(createProject(), 'ch1', {
      id: 'note-recognised', step: 0, pitch: 60, durationSteps: 1, confidence: 1.5,
      pitchBend: [{ time: -1, value: 2 }, { time: 0.1, value: 0.2 }],
    });
    p = setStepEventMetadata(p, 'ch1', 0, { confidence: -1 });
    expect(p.channels[0].notes[0].confidence).toBe(1);
    expect(p.channels[0].notes[0].pitchBend).toEqual([{ time: 0.1, value: 0.2 }]);
    expect(p.channels[0].stepEventMetadata).toEqual({ 0: { confidence: 0 } });
    expect(setStepEventMetadata(p, 'ch1', 16, { confidence: 0.5 })).toBe(p);
  });
  it('stores guitar chord symbols as events and keeps them synchronized through editing tools', () => {
    let p = addPattern(createProject(), 'Verse');
    p = addChordEvent(p, 'ch1', {
      id: 'chord-1', step: 2, root: 60, quality: 'major7', articulation: 'down-strum', durationSteps: 2,
    });
    expect(p.channels[0].chordEvents?.[0]).toMatchObject({ root: 60, quality: 'major7', articulation: 'down-strum' });
    expect(p.patterns[0].channels[0].chordEvents).toEqual(p.channels[0].chordEvents);
    p = transposeChannelNotes(p, 'ch1', 2);
    p = shiftChannelNotes(p, 'ch1', 1);
    p = scaleChannelNoteDurations(p, 'ch1', 2);
    expect(p.channels[0].chordEvents?.[0]).toMatchObject({ root: 62, step: 3, durationSteps: 4 });
    expect(p.patterns[0].channels[0].chordEvents).toEqual(p.channels[0].chordEvents);
    p = removeChordEvent(p, 'ch1', 'chord-1');
    expect(p.patterns[0].channels[0].chordEvents).toEqual([]);
  });
  it('switches patterns and persists edits without sharing channel arrays', () => {
    let p = toggleStep(addPattern(createProject(), 'Verse'), 'ch1', 0);
    p = addPattern(p, 'Chorus');
    expect(p.channels[0].steps[0]).toBe(true);
    p = toggleStep(p, 'ch1', 1);
    p = selectPattern(p, 'pattern-1');
    expect(p.channels[0].steps.slice(0, 2)).toEqual([true, false]);
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
    p = removeArrangementClip(p, p.arrangement[0].id);
    expect(p.arrangement).toEqual([]);
    expect(removePattern(p, p.patterns[0].id).arrangement).toEqual([]);
  });
  it('stores a normalized scale root and scale id', () => {
    expect(setScale(createProject(), -1, 'minor')).toMatchObject({ scaleRoot: 11, scaleId: 'minor' });
  });
  it('transposes notes within the MIDI range and keeps the selected pattern synchronized', () => {
    let p = addPattern(createProject(), 'Verse');
    p = addNote(p, 'ch1', { id: 'low', step: 0, pitch: 0, durationSteps: 1 });
    p = addNote(p, 'ch1', { id: 'high', step: 1, pitch: 127, durationSteps: 1 });
    p = transposeChannelNotes(p, 'ch1', 12);
    expect(p.channels[0].notes.map((note) => note.pitch)).toEqual([12, 127]);
    expect(p.patterns[0].channels[0].notes).toEqual(p.channels[0].notes);
    p = transposeChannelNotes(p, 'ch1', -24);
    expect(p.channels[0].notes.map((note) => note.pitch)).toEqual([0, 103]);
  });
  it('shifts notes around the loop and scales durations to at least one step', () => {
    let p = addNote(createProject(), 'ch1', { id: 'note', step: 0, pitch: 60, durationSteps: 3 });
    p = shiftChannelNotes(p, 'ch1', -1);
    expect(p.channels[0].notes[0].step).toBe(15);
    p = scaleChannelNoteDurations(p, 'ch1', 0.5);
    expect(p.channels[0].notes[0].durationSteps).toBe(2);
    p = scaleChannelNoteDurations(p, 'ch1', 0.1);
    expect(p.channels[0].notes[0].durationSteps).toBe(1);
  });
  it('stores a valid swing template and defaults invalid values to straight', () => {
    expect(setSwingTemplate(createProject(), 'triplet').swingTemplate).toBe('triplet');
    expect(setSwingTemplate(createProject(), 'invalid' as never).swingTemplate).toBe('straight');
  });
  it('adds suggested chords as a separate generated track without changing the melody', () => {
    const melody = { id: 'melody-1', step: 0, pitch: 60, durationSteps: 2, confidence: 0.9 };
    let p = addPattern(addNote(createProject(), 'ch1', melody), 'Verse');
    const suggestions = suggestChordsFromNotes([melody], p.scaleRoot, p.scaleId, p.noteLength, p.loopBars);
    p = addGeneratedChordChannel(p, 'ch1', suggestions);

    expect(p.channels).toHaveLength(2);
    expect(p.channels[0].notes).toMatchObject([melody]);
    expect(p.channels[1]).toMatchObject({
      name: 'Suggested chords · Kick', soundId: 'keys-1',
      generatedMetadata: { generatedBy: 'arrangement-assistant', kind: 'chord-suggestions', sourceChannelId: 'ch1' },
    });
    expect(p.channels[1].notes.length).toBeGreaterThan(0);
    expect(p.patterns[0].channels[1].generatedMetadata).toEqual(p.channels[1].generatedMetadata);
  });
  it('replaces and removes suggested chord tracks without affecting their source', () => {
    const melody = { id: 'melody-1', step: 0, pitch: 60, durationSteps: 2 };
    let p = addNote(createProject(), 'ch1', melody);
    const first = suggestChordsFromNotes([melody], p.scaleRoot, p.scaleId, p.noteLength, p.loopBars);
    p = addGeneratedChordChannel(p, 'ch1', first);
    const generatedId = p.channels[1].id;
    const replacement = [{ ...first[0], root: 62, quality: 'minor' as const }];
    p = replaceGeneratedChordChannel(p, generatedId, 'ch1', replacement);

    expect(p.channels[0].notes).toMatchObject([melody]);
    expect(p.channels[1].notes[0]).toMatchObject({ pitch: 62, confidence: replacement[0].confidence });
    expect(p.channels[1].generatedMetadata?.sourceChannelId).toBe('ch1');
    p = removeGeneratedChordChannel(p, generatedId);
    expect(p.channels).toHaveLength(1);
    expect(p.channels[0].notes).toMatchObject([melody]);
  });
  it('rejects generated chord operations for generated sources or non-generated replacements', () => {
    const melody = { id: 'melody-1', step: 0, pitch: 60, durationSteps: 1 };
    let p = addNote(createProject(), 'ch1', melody);
    const suggestions = suggestChordsFromNotes([melody], 0, 'major', 16, 1);
    p = addGeneratedChordChannel(p, 'ch1', suggestions);
    expect(addGeneratedChordChannel(p, p.channels[1].id, suggestions)).toBe(p);
    expect(replaceGeneratedChordChannel(p, 'ch1', 'ch1', suggestions)).toBe(p);
    expect(removeGeneratedChordChannel(p, 'ch1')).toBe(p);
  });
  it('templates are consistent', () => {
    for (const t of TEMPLATES) {
      const p = t.make();
      expect(p.channels.every((c) => c.steps.length === totalSteps(p))).toBe(true);
    }
  });
});
