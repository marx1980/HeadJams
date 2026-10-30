import { describe, expect, it } from 'vitest';
import { compileStep, STRUM_STAGGER_SEC, type PitchedVoice } from './performance';
import { renderProject } from './render';
import { createChannel, createProject, type ChordEvent, type Project } from '../model/project';
import { diskStore } from './sampler/testing';
import { instrumentNeeds } from './sampler/instrumentStore';

const chords: ChordEvent[] = [
  { id: 'c', step: 0, root: 48, quality: 'major', articulation: 'down-strum', durationSteps: 4 },
  { id: 'g', step: 4, root: 55, quality: 'major', articulation: 'up-strum', durationSteps: 4 },
  { id: 'am', step: 8, root: 57, quality: 'minor', articulation: 'sustained', durationSteps: 4 },
  { id: 'f', step: 12, root: 53, quality: 'major', articulation: 'power', durationSteps: 4 },
];
const project = (soundId: string): Project => {
  const p = createProject('g');
  p.channels = [{ ...createChannel('a', 'Guitar', soundId), chordEvents: chords }];
  return p;
};
const pitched = (p: Project, step: number) => compileStep(p, step, (steps) => steps * 0.125) as PitchedVoice[];

describe('sampled guitar performance', () => {
  it('plays real shapes string by string, with per-string choke (natural) or whole-chord choke (tight)', () => {
    const c = pitched(project('nylon-chords'), 0);
    expect(c.map((v) => v.pitch)).toEqual([48, 52, 55, 60, 64]);
    for (let i = 1; i < c.length; i++) expect(c[i].offsetSec).toBeGreaterThan(c[i - 1].offsetSec);
    expect(c.map((v) => v.chokeKey)).toEqual(['string1', 'string2', 'string3', 'string4', 'string5']);
    const up = pitched(project('nylon-chords'), 4);
    expect(up[0].pitch).toBeGreaterThan(up[up.length - 1].pitch);
    expect(pitched(project('clean-chords-tight'), 0).every((v) => v.chokeKey === 'chord')).toBe(true);
    expect(pitched(project('nylon-chords'), 12).map((v) => v.pitch % 12)).toEqual(expect.arrayContaining([5, 0]));
  });

  it('leaves Classic synth chords on the original path', () => {
    const synth = pitched(project('guitar-chord-acoustic'), 0);
    expect(synth.map((v) => v.offsetSec)).toEqual(synth.map((_, i) => i * STRUM_STAGGER_SEC));
    expect(synth.every((v) => v.chokeKey === undefined)).toBe(true);
  });

  it('renders the same audio every time, and natural ringing differs from tight', async () => {
    const render = async (soundId: string) => {
      const p = project(soundId);
      const store = diskStore();
      await store.prepare(instrumentNeeds(p));
      const audio = store.exportAudio(instrumentNeeds(p).keys());
      return renderProject(p, 22050, new Map(), {
        manifests: new Map(audio.manifests.map((m) => [m.id, m])), regions: new Map(audio.regions.map((r) => [r.key, r])),
      }).left;
    };
    const first = await render('clean-chords');
    expect(first).toEqual(await render('clean-chords'));
    expect(first.some((v) => Math.abs(v) > 0.05)).toBe(true);
    expect(await render('clean-chords-tight')).not.toEqual(first);
  });
});
