import { describe, expect, it } from 'vitest';
import { STARTER_SOUNDS, findSound, renderPitchedNote, renderSound } from '../library/sounds';
import { addArrangementClip, addChordEvent, addNote, addPattern, addSampleSound, createProject, toggleStep, updateChannel } from '../model/project';
import { TEMPLATES } from '../model/templates';
import { renderProject } from './render';
import { encodeWav } from './wav';
import { TUTORIALS, countNotes } from '../tutorial/tutorials';

describe('sound library', () => {
  it('has about 30 unique starter sounds that render audibly within range', () => {
    expect(STARTER_SOUNDS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(STARTER_SOUNDS.map((s) => s.id)).size).toBe(STARTER_SOUNDS.length);
    for (const s of STARTER_SOUNDS) {
      const d = renderSound(s.params, 8000);
      expect(d.some((x) => Math.abs(x) > 0.01)).toBe(true);
      expect(d.every((x) => Math.abs(x) <= 1)).toBe(true);
    }
  });
  it('templates only use existing sounds', () => {
    for (const t of TEMPLATES) {
      const p = t.make();
      p.channels.forEach((c) => expect(findSound(p, c.soundId)).toBeDefined());
    }
  });
});

describe('render + wav', () => {
  it('silent project renders silence; a note renders sound', () => {
    expect(renderProject(createProject(), 8000).left.every((x) => x === 0)).toBe(true);
    expect(renderProject(toggleStep(createProject(), 'ch1', 0), 8000).left.some((x) => x !== 0)).toBe(true);
  });
  it('renders stored sample audio in the project mix', () => {
    const sample = { id: 'sample-1', samples: new Float32Array([0.25, -0.5, 0.75]), sampleRate: 8000 };
    const project = addSampleSound(createProject(), 'Sample', sample.id);
    project.channels[0].soundId = project.customSounds[0].id;
    project.channels[0].steps[0] = true;
    const rendered = renderProject(project, 8000, new Map([[sample.id, sample]]));
    expect(rendered.left.slice(0, 3)).toEqual(new Float32Array([0.2, -0.4, 0.6]));
  });
  it('plays the original sample on its own channel when requested', () => {
    const sample = {
      id: 'sample-original',
      samples: new Float32Array([0.1, 0.2, 0.3]),
      originalSamples: new Float32Array([0.5, -0.5, 0.25]),
      sampleRate: 8000,
    };
    const project = createProject();
    project.customSounds.push({
      id: 'original-sound',
      name: 'Original',
      category: 'Samples',
      params: { wave: 'sine', freq: 440, freqEnd: 440, decay: 0.1, cutoff: 12000 },
      sampleId: sample.id,
      sampleVersion: 'original',
    });
    project.channels[0].soundId = 'original-sound';
    project.channels[0].steps[0] = true;
    const rendered = renderProject(project, 8000, new Map([[sample.id, sample]]));
    expect(rendered.left.slice(0, 3)).toEqual(new Float32Array([0.4, -0.4, 0.2]));
  });
  it('renders pitched notes with duration and overlapping voices', () => {
    const note = renderPitchedNote(STARTER_SOUNDS.find((sound) => sound.id === 'lead-1')!.params, 69, 0.1, 0.8, 8000);
    expect(note.length).toBeGreaterThan(800);
    expect(note.some((sample) => sample !== 0)).toBe(true);
    const bent = renderPitchedNote(STARTER_SOUNDS.find((sound) => sound.id === 'lead-1')!.params,
      69, 0.1, 0.8, 8000, [{ time: 0.04, value: 12 }]);
    expect(bent).not.toEqual(note);

    let project = addNote(createProject(), 'ch1', { id: 'a', step: 0, pitch: 60, durationSteps: 2 });
    project = addNote(project, 'ch1', { id: 'b', step: 0, pitch: 64, durationSteps: 2 });
    expect(renderProject(project, 8000).left.some((sample) => sample !== 0)).toBe(true);
  });
  it('renders guitar chord events with articulation-specific voicings', () => {
    const base = updateChannel(createProject(), 'ch1', { soundId: 'guitar-chord-clean' });
    const chord = addChordEvent(base, 'ch1', {
      id: 'chord-1', step: 0, root: 60, quality: 'minor7', articulation: 'down-strum', durationSteps: 2,
    });
    const power = addChordEvent(base, 'ch1', {
      id: 'chord-1', step: 0, root: 60, quality: 'minor7', articulation: 'power', durationSteps: 2,
    });
    const renderedChord = renderProject(chord, 8000).left;
    const renderedPower = renderProject(power, 8000).left;
    expect(renderedChord.some((sample) => sample !== 0)).toBe(true);
    expect(renderedPower.some((sample) => sample !== 0)).toBe(true);
    expect(renderedPower).not.toEqual(renderedChord);
  });
  it('renders clips at their arrangement positions and repeats pattern steps', () => {
    let project = addPattern(toggleStep(createProject(), 'ch1', 0), 'Verse');
    project = addArrangementClip(project, project.patterns[0].id, 4, 20);
    const rendered = renderProject(project, 8000);
    const stepSamples = Math.round((240 / project.bpm / project.noteLength) * 8000);
    expect(rendered.left[0]).toBe(0);
    expect(rendered.left[stepSamples * 4]).not.toBe(0);
    expect(rendered.left[stepSamples * 20]).not.toBe(0);
  });
  it('writes a valid WAV header', () => {
    const buf = encodeWav(new Float32Array(10), new Float32Array(10), 44100);
    const v = new DataView(buf);
    expect(buf.byteLength).toBe(44 + 40);
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF');
    expect(v.getUint32(24, true)).toBe(44100);
  });
});

describe('tutorials', () => {
  it('has seven tutorials whose first step is not already done', () => {
    expect(TUTORIALS).toHaveLength(7);
    const p = createProject();
    for (const t of TUTORIALS) expect(t.steps[0].done({ project: p, base: p, events: new Set() })).toBe(false);
  });
  it('first-beat step 1 completes when a note is placed', () => {
    const p = createProject();
    expect(countNotes(toggleStep(p, 'ch1', 0))).toBe(1);
    expect(TUTORIALS[0].steps[0].done({ project: toggleStep(p, 'ch1', 0), base: p, events: new Set() })).toBe(true);
  });
});
