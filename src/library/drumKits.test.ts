import { describe, expect, it } from 'vitest';
import { addPattern, createProject, toggleStep } from '../model/project';
import { applyDrumKit, DRUM_KITS, findDrumKit } from './drumKits';

describe('drum kits', () => {
  it('applies a kit by role and preserves the active pattern content', () => {
    let project = addPattern(toggleStep(createProject(), 'ch1', 2), 'Verse');
    const result = applyDrumKit(project, DRUM_KITS[0]);

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    project = result.project;
    expect(project.channels).toHaveLength(DRUM_KITS[0].channels.length);
    expect(project.channels[0]).toMatchObject({ soundId: 'kick-1', role: 'kick', kitId: 'studio-kit' });
    expect(project.channels[0].steps[2]).toBe(true);
    expect(project.patterns[0].channels).toEqual(project.channels);

    const switched = applyDrumKit(project, DRUM_KITS[1], true);
    expect(switched.status).toBe('applied');
    if (switched.status === 'applied') {
      expect(switched.project.channels[0]).toMatchObject({ soundId: 'kick-6', role: 'kick', kitId: '808-kit' });
      expect(switched.project.channels[0].steps[2]).toBe(true);
      expect(switched.project.patterns[0].channels).toEqual(switched.project.channels);
    }
  });

  it('requires confirmation before replacing an existing sound assignment', () => {
    const project = createProject();
    const result = applyDrumKit(project, DRUM_KITS[1]);

    expect(result.status).toBe('confirmation-required');
    expect(result.project).toBe(project);
    const confirmed = applyDrumKit(project, DRUM_KITS[1], true);
    expect(confirmed.status).toBe('applied');
  });

  it('leaves the project unchanged when there is not enough channel capacity', () => {
    let project = createProject();
    for (let index = 0; index < 7; index++) {
      project = { ...project, channels: [...project.channels, {
        ...project.channels[0], id: `other-${index}`, soundId: 'bass-1',
      }] };
    }

    const result = applyDrumKit(project, DRUM_KITS[0]);
    expect(result.status).toBe('capacity-exceeded');
    expect(result.project).toBe(project);
  });

  it('can apply a percussion kit using non-drum percussion roles', () => {
    const result = applyDrumKit(createProject(), DRUM_KITS[2]);

    expect(result.status).toBe('applied');
    if (result.status === 'applied') {
      expect(result.project.channels.filter((channel) => channel.role).map((channel) => channel.role)).toEqual([
        'hand-percussion', 'shaker', 'auxiliary',
      ]);
    }
  });
});

describe('acoustic kit', () => {
  it('maps every role to a sampled sound on the bundled acoustic-kit instrument', async () => {
    const { readFileSync } = await import('node:fs');
    const { SAMPLED_SOUNDS } = await import('./instrumentRegistry');
    const manifest = JSON.parse(readFileSync(new URL('../../app/public/instruments/acoustic-kit/manifest.json', import.meta.url), 'utf8')) as { regions: { rootMidi: number }[] };
    const notes = new Set(manifest.regions.map((region) => region.rootMidi));
    for (const sound of SAMPLED_SOUNDS.filter((item) => item.instrumentId === 'acoustic-kit')) {
      expect(notes.has(sound.instrumentNote!)).toBe(true);
    }
    const kit = findDrumKit('acoustic-kit')!;
    expect(kit.channels.every((channel) => SAMPLED_SOUNDS.some((sound) => sound.id === channel.soundId))).toBe(true);
  });

  it('swaps between synth and acoustic kits by role', () => {
    const studio = applyDrumKit(createProject(), findDrumKit('studio-kit')!, true);
    const acoustic = applyDrumKit(studio.project, findDrumKit('acoustic-kit')!, true);
    const back = applyDrumKit(acoustic.project, findDrumKit('808-kit')!, true);
    expect(acoustic.project.channels.find((c) => c.role === 'kick')?.soundId).toBe('acoustic-kick');
    expect(back.project.channels.find((c) => c.role === 'kick')?.soundId).toBe('kick-6');
    expect(back.project.channels.length).toBe(acoustic.project.channels.length);
  });
});
