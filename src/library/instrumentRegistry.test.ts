import { describe, expect, it } from 'vitest';
import { addSampleSound, createProject } from '../model/project';
import { createInstrumentRegistry, STARTER_SOUNDS, validateInstrumentRegistry } from './instrumentRegistry';

describe('instrument registry', () => {
  it('keeps starter sound IDs unique and stable', () => {
    expect(STARTER_SOUNDS).toHaveLength(58);
    expect(new Set(STARTER_SOUNDS.map((sound) => sound.id)).size).toBe(STARTER_SOUNDS.length);
    expect(STARTER_SOUNDS.map((sound) => sound.id)).toContain('kick-1');
    expect(STARTER_SOUNDS.map((sound) => sound.id)).toContain('fx-1');
  });

  it('adds synthesized drum and percussion sounds to their existing groups', () => {
    const registry = createInstrumentRegistry([]);

    expect(registry.find((entry) => entry.id === 'cymbal-1')).toMatchObject({
      origin: 'built-in', source: 'synth', group: 'Drums',
    });
    expect(registry.find((entry) => entry.id === 'perc-7')).toMatchObject({
      origin: 'built-in', source: 'synth', group: 'Percussion',
    });
    expect(registry.map((entry) => entry.id)).toContain('kick-1');
    expect(registry.map((entry) => entry.id)).toContain('fx-1');
  });

  it('adds synthesized Keys, Strings, and Brass & Winds presets', () => {
    const registry = createInstrumentRegistry([]);

    for (const [id, group] of [
      ['keys-1', 'Keys'],
      ['strings-1', 'Strings'],
      ['brass-1', 'Brass & Winds'],
    ]) {
      expect(registry.find((entry) => entry.id === id)).toMatchObject({
        origin: 'built-in', source: 'synth', group,
      });
    }
    expect(registry.map((entry) => entry.sound.name)).toContain('Organ Synth');
    expect(registry.map((entry) => entry.sound.name)).toContain('Strings Pad');
    expect(registry.map((entry) => entry.sound.name)).toContain('Flute Synth');
  });

  it('includes ten additional Bass, Synths, Drums, and Percussion sounds', () => {
    const registry = createInstrumentRegistry([]);
    const additions: Array<[string, string]> = [
      ['bass-6', 'Bass'], ['bass-7', 'Bass'], ['bass-8', 'Bass'],
      ['lead-6', 'Synths'], ['lead-7', 'Synths'], ['lead-8', 'Synths'], ['lead-9', 'Synths'],
      ['kick-6', 'Drums'], ['snare-5', 'Drums'], ['perc-8', 'Percussion'],
    ];

    for (const [id, group] of additions) {
      expect(registry.find((entry) => entry.id === id)).toMatchObject({
        origin: 'built-in', source: 'synth', group,
      });
    }
  });

  it('includes built-in and custom sounds with source and group metadata', () => {
    const project = addSampleSound(createProject(), 'Field recording', 'sample-1');
    const registry = createInstrumentRegistry(project.customSounds);

    expect(registry[0]).toMatchObject({ id: 'kick-1', origin: 'built-in', source: 'synth', group: 'Drums' });
    expect(registry.at(-1)).toMatchObject({
      id: project.customSounds[0].id, origin: 'custom', source: 'sample', group: 'Samples',
    });
    expect(registry.find((entry) => entry.id === 'lead-1')?.group).toBe('Synths');
    expect(registry.find((entry) => entry.id === 'lead-5')?.group).toBe('FX & Other');
    expect(registry.find((entry) => entry.id === 'fx-1')?.group).toBe('FX & Other');
    expect(registry.map((entry) => entry.sound)).toEqual([...STARTER_SOUNDS, ...project.customSounds]);
  });

  it('reports duplicate IDs and sample references missing from a supplied asset set', () => {
    const project = addSampleSound(createProject(), 'Field recording', 'sample-1');
    const registry = createInstrumentRegistry([STARTER_SOUNDS[0], ...project.customSounds]);

    expect(validateInstrumentRegistry(registry, new Set())).toEqual([
      { type: 'duplicate-id', id: 'kick-1' },
      { type: 'missing-sample', id: project.customSounds[0].id },
    ]);
  });

  it('reports malformed sample IDs without treating them as available assets', () => {
    const sound = { ...STARTER_SOUNDS[0], id: 'broken-sample', sampleId: '  ' };
    const registry = createInstrumentRegistry([sound]);

    expect(validateInstrumentRegistry(registry, new Set())).toContainEqual({
      type: 'invalid-sample-id', id: 'broken-sample',
    });
  });
});
