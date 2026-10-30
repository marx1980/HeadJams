import { describe, expect, it } from 'vitest';
import { createChannel, createProject, type Project } from '../model/project';
import { STARTER_SOUNDS } from '../library/instrumentRegistry';
import { compileStep, MUTED_CHORD_MAX_SEC, MUTED_CHORD_VELOCITY, STRUM_STAGGER_SEC, type PitchedVoice } from './performance';

const chordSound = STARTER_SOUNDS.find((sound) => sound.playbackMode === 'chord')!;
const noteSound = STARTER_SOUNDS.find((sound) => sound.playbackMode === 'notes')!;
const perStep = (steps: number) => steps * 0.125;

function project(): Project {
  const p = createProject();
  p.channels = [
    { ...createChannel('kick', 'Kick', 'kick-1'), steps: [true, false, true, false] },
    { ...createChannel('lead', 'Lead', noteSound.id), notes: [{ id: 'n', step: 1, pitch: 64, durationSteps: 2, velocity: 0.5 }] },
    {
      ...createChannel('gtr', 'Guitar', chordSound.id),
      chordEvents: [
        { id: 'd', step: 0, root: 57, quality: 'minor', articulation: 'down-strum', durationSteps: 4 },
        { id: 'u', step: 1, root: 57, quality: 'minor', articulation: 'up-strum', durationSteps: 4 },
        { id: 'm', step: 2, root: 57, quality: 'minor', articulation: 'muted', durationSteps: 4, velocity: 0.8 },
      ],
    },
  ];
  return p;
}

describe('compileStep', () => {
  it('emits grid hits, notes and chord strings in channel order', () => {
    const voices = compileStep(project(), 0, perStep);
    expect(voices[0]).toMatchObject({ kind: 'hit', channelId: 'kick', offsetSec: 0 });
    expect(voices.slice(1).every((voice) => voice.kind === 'pitched' && voice.origin === 'chord')).toBe(true);
    const note = compileStep(project(), 1, perStep).find((voice) => voice.channelId === 'lead') as PitchedVoice;
    expect(note).toMatchObject({ origin: 'note', pitch: 64, durationSec: 0.25, velocity: 0.5 });
  });

  it('strums down low to high and up high to low with a fixed stagger', () => {
    const down = compileStep(project(), 0, perStep).filter((v): v is PitchedVoice => v.kind === 'pitched');
    const up = compileStep(project(), 1, perStep).filter((v): v is PitchedVoice => v.kind === 'pitched' && v.origin === 'chord');
    expect(down.map((v) => v.offsetSec)).toEqual(down.map((_, i) => i * STRUM_STAGGER_SEC));
    expect(down.map((v) => v.pitch)).toEqual([...down.map((v) => v.pitch)].sort((a, b) => a - b));
    expect(up.map((v) => v.pitch)).toEqual(down.map((v) => v.pitch).reverse());
    expect(down[1].durationSec).toBeCloseTo(0.5 - STRUM_STAGGER_SEC);
  });

  it('shortens and softens muted chords', () => {
    const muted = compileStep(project(), 2, perStep).filter((v): v is PitchedVoice => v.kind === 'pitched');
    expect(muted.every((v) => v.durationSec === MUTED_CHORD_MAX_SEC && v.offsetSec === 0)).toBe(true);
    expect(muted[0].velocity).toBeCloseTo(0.8 * MUTED_CHORD_VELOCITY);
  });

  it('respects mute and solo, and ignores chord events on non-chord sounds', () => {
    const p = project();
    p.channels[0].mute = true;
    expect(compileStep(p, 0, perStep).some((v) => v.channelId === 'kick')).toBe(false);
    p.channels[0].mute = false;
    p.channels[1].solo = true;
    expect(compileStep(p, 1, perStep).every((v) => v.channelId === 'lead')).toBe(true);
    p.channels[1].solo = false;
    p.channels[2].soundId = noteSound.id;
    expect(compileStep(p, 0, perStep).some((v) => v.channelId === 'gtr')).toBe(false);
  });
});

describe('play what I sang', () => {
  it('starts the original recording at its aligned offset, only when the toggle is on', async () => {
    const { renderProject } = await import('./render');
    const { addSampleSound } = await import('../model/project');
    let p = createProject();
    p = addSampleSound(p, 'Take', 'smp');
    const soundId = p.customSounds[0].id;
    p.channels = [{ ...createChannel('m', 'Melody', noteSound.id), original: { soundId, offsetSec: 0.3 }, playOriginal: false }];
    const stepSec = 60 / p.bpm / 4;
    const step = Math.floor(0.3 / stepSec);
    expect(compileStep(p, step, (n) => n * stepSec).some((v) => v.sound.id === soundId)).toBe(false);
    p.channels[0].playOriginal = true;
    const voice = compileStep(p, step, (n) => n * stepSec).find((v) => v.sound.id === soundId)!;
    expect(voice.offsetSec).toBeCloseTo(0.3 - step * stepSec);
    const samples = new Map([['smp', { id: 'smp', sampleRate: 44100, samples: new Float32Array(4410).fill(0.5) }]]);
    const { left } = renderProject(p, 44100, samples);
    const first = left.findIndex((value) => value !== 0);
    expect(first / 44100).toBeCloseTo(0.3, 2);
  });
});
