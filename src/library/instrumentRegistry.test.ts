import { describe, expect, it } from 'vitest';
import { addSampleSound, createProject } from '../model/project';
import { createInstrumentRegistry, SAMPLED_SOUNDS, STARTER_SOUNDS, validateInstrumentRegistry } from './instrumentRegistry';

describe('instrument registry', () => {
  it('keeps starter sound IDs unique and stable', () => {
    expect(STARTER_SOUNDS).toHaveLength(67);
    expect(new Set(STARTER_SOUNDS.map((sound) => sound.id)).size).toBe(STARTER_SOUNDS.length);
    expect(STARTER_SOUNDS.map((sound) => sound.id)).toContain('kick-1');
    expect(STARTER_SOUNDS.map((sound) => sound.id)).toContain('fx-1');
  });

  it('preserves every original starter sound ID', () => {
    const originalIds = [
      'kick-1', 'kick-2', 'kick-3', 'kick-4', 'snare-1', 'snare-2', 'snare-3', 'clap-1', 'clap-2',
      'hat-1', 'hat-2', 'hat-3', 'hat-4', 'tom-1', 'tom-2', 'tom-3', 'perc-1', 'perc-2', 'perc-3',
      'bass-1', 'bass-2', 'bass-3', 'bass-4', 'bass-5', 'lead-1', 'lead-2', 'lead-3', 'lead-4',
      'lead-5', 'fx-1',
    ];
    const currentIds = new Set(STARTER_SOUNDS.map((sound) => sound.id));

    expect(originalIds.every((id) => currentIds.has(id))).toBe(true);
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

  it('classifies guitar presets as pitched-note instruments and records procedural attribution', () => {
    const registry = createInstrumentRegistry([]);
    const guitar = registry.find((entry) => entry.id === 'guitar-electric-1');

    expect(guitar).toMatchObject({
      group: 'Guitars', subgroup: 'Electric', type: 'pitched', playbackMode: 'notes', source: 'synth',
    });
    expect(guitar?.sound).toMatchObject({
      assetSource: 'procedural',
      assetAttribution: 'MusicMaker procedural synthesizer',
      assetLicense: 'Original procedural synthesis; no third-party audio asset',
    });
    expect(registry.find((entry) => entry.id === 'lead-1')?.sound.category).toBe('Synths');
    expect(registry.find((entry) => entry.id === 'kick-1')).toMatchObject({
      group: 'Drums', subgroup: 'Kick', type: 'percussion', playbackMode: 'one-shot',
    });
    expect(STARTER_SOUNDS.every((sound) =>
      sound.assetSource === 'procedural' && Boolean(sound.assetAttribution && sound.assetLicense),
    )).toBe(true);
  });

  it('registers synthesized chord-mode guitar presets in the Chords subgroup', () => {
    const registry = createInstrumentRegistry([]);
    const chordPresets = registry.filter((entry) => entry.subgroup === 'Chords' && !entry.sound.instrumentId);
    expect(chordPresets.map((entry) => entry.id)).toEqual([
      'guitar-chord-acoustic', 'guitar-chord-clean', 'guitar-chord-crunch', 'guitar-chord-power',
    ]);
    expect(chordPresets.every((entry) => entry.group === 'Guitars' && entry.type === 'chord'
      && entry.playbackMode === 'chord' && entry.source === 'synth')).toBe(true);
  });

  it('registers the sampled guitars with notes and chord sounds', () => {
    const registry = createInstrumentRegistry([]);
    const sampled = registry.filter((entry) => entry.group === 'Guitars' && entry.sound.instrumentId);
    expect(sampled.map((entry) => [entry.id, entry.sound.instrumentId, entry.playbackMode])).toEqual([
      ['nylon-guitar', 'nylon-guitar', 'notes'], ['nylon-chords', 'nylon-guitar', 'chord'],
      ['clean-guitar', 'clean-guitar', 'notes'], ['clean-chords', 'clean-guitar', 'chord'],
      ['clean-chords-tight', 'clean-guitar', 'chord'],
    ]);
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
    expect(registry.map((entry) => entry.sound)).toEqual([...STARTER_SOUNDS, ...SAMPLED_SOUNDS, ...project.customSounds]);
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
