import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProject } from './project';
import { loadProject, saveProject } from './storage';

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, String(value)); },
  removeItem: (key: string) => { values.delete(key); },
  clear: () => values.clear(),
  key: (index: number) => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};

describe('project storage migration', () => {
  beforeEach(() => {
    values.clear();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it('gives projects without a seed a stable default and keeps an existing seed', () => {
    const project = createProject() as Partial<ReturnType<typeof createProject>>;
    delete project.seed;
    values.set('musicmaker.project.v4', JSON.stringify(project));
    expect(loadProject().seed).toBe(1);
    values.set('musicmaker.project.v4', JSON.stringify({ ...createProject(), seed: 4242 }));
    expect(loadProject().seed).toBe(4242);
    values.set('musicmaker.project.v4', JSON.stringify({ ...createProject(), seed: -3 }));
    expect(loadProject().seed).toBe(1);
  });

  it('keeps kit lanes, chord rows and chord event options across save and load, and drops malformed ones', () => {
    const project = createProject();
    project.channels = [
      { ...project.channels[0], id: 'kit', kitId: 'acoustic-kit', lanes: [
        { id: 'kick', name: 'Kick', soundId: 'acoustic-kick', steps: [true, ...new Array(15).fill(false)] },
        { id: 'kick', name: 'Dup', soundId: 'x', steps: [] },
        { id: 'snare', name: 'Snare', soundId: 'acoustic-snare', steps: [false, true], mute: true },
      ] },
      { ...project.channels[0], id: 'gtr', soundId: 'nylon-chords',
        chordRow: { chords: 'Am F', pattern: 'pop', strumMs: 999, humanise: 0.6, capo: 2 },
        chordEvents: [{ id: 'row-0-0', step: 0, root: 57, quality: 'minor', articulation: 'down-strum', durationSteps: 4,
          strings: [1, 9], strumMs: 30, humanise: 2, capo: 3 }] },
    ];
    saveProject(project);
    const [kit, guitar] = loadProject().channels;
    expect(kit.lanes!.map((lane) => [lane.id, lane.steps.length, lane.mute ?? false])).toEqual([['kick', 16, false], ['snare', 16, true]]);
    expect(kit.lanes![1].steps.slice(0, 2)).toEqual([false, true]);
    expect(guitar.chordRow).toEqual({ chords: 'Am F', pattern: 'pop', strumMs: 200, humanise: 0.6, capo: 2 });
    expect(guitar.chordEvents![0]).toMatchObject({ strings: [1], strumMs: 30, humanise: 1, capo: 3 });
  });

  it('loads legacy v1 projects without changing sound and sample references', () => {
    const project = createProject();
    project.channels[0].soundId = 'legacy-custom-id';
    project.customSounds.push({
      id: 'legacy-custom-id',
      name: 'Legacy sample',
      category: 'Samples',
      params: { wave: 'sine', freq: 440, freqEnd: 440, decay: 0.1, cutoff: 12000 },
      sampleId: 'legacy-sample-id',
    });
    const legacy = { ...project } as Partial<typeof project>;
    delete legacy.formatVersion;
    values.set('musicmaker.project.v1', JSON.stringify(legacy));

    const loaded = loadProject();
    expect(loaded.formatVersion).toBe(4);
    expect(loaded.channels[0].soundId).toBe('legacy-custom-id');
    expect(loaded.customSounds[0].sampleId).toBe('legacy-sample-id');
  });

  it('prefers current projects and saves the current format version', () => {
    const legacy = createProject();
    legacy.name = 'Legacy';
    const current = createProject();
    current.name = 'Current';
    values.set('musicmaker.project.v1', JSON.stringify(legacy));
    values.set('musicmaker.project.v4', JSON.stringify(current));

    expect(loadProject().name).toBe('Current');
    saveProject(current);
    const saved = JSON.parse(values.get('musicmaker.project.v4')!) as { formatVersion: number };
    expect(saved.formatVersion).toBe(4);
  });

  it('round-trips optional kit roles without changing the project format version', () => {
    const project = createProject();
    project.channels[0].kitId = 'studio-kit';
    project.channels[0].role = 'kick';
    saveProject(project);

    const loaded = loadProject();
    expect(loaded.formatVersion).toBe(4);
    expect(loaded.channels[0]).toMatchObject({ kitId: 'studio-kit', role: 'kick' });
  });

  it('round-trips chord events and defaults older channels to no chord events', () => {
    const project = createProject();
    project.channels[0].chordEvents = [{
      id: 'chord-1', step: 3, root: 62, quality: 'minor7', articulation: 'up-strum', durationSteps: 2,
    }];
    saveProject(project);

    expect(loadProject().channels[0].chordEvents).toEqual(project.channels[0].chordEvents);

    const older = createProject();
    delete (older.channels[0] as { chordEvents?: unknown }).chordEvents;
    values.set('musicmaker.project.v4', JSON.stringify(older));
    expect(loadProject().channels[0].chordEvents).toEqual([]);
  });

  it('round-trips recognized note and step metadata while older projects default cleanly', () => {
    const project = createProject();
    project.channels[0].notes = [{
      id: 'note-1', step: 2, pitch: 64, durationSteps: 2, confidence: 0.45,
      pitchBend: [{ time: 0.1, value: 0.2 }], sourceTakeId: 'take-1',
    }];
    project.channels[0].steps[3] = true;
    project.channels[0].stepEventMetadata = { 3: { confidence: 0.35, sourceTakeId: 'take-1' } };
    saveProject(project);

    expect(loadProject().channels[0]).toMatchObject({
      notes: project.channels[0].notes,
      stepEventMetadata: project.channels[0].stepEventMetadata,
    });

    const older = createProject();
    values.set('musicmaker.project.v4', JSON.stringify(older));
    expect(loadProject().channels[0].stepEventMetadata).toEqual({});
  });

  it('falls back to the legacy project when the v2 entry is corrupt', () => {
    const legacy = createProject();
    legacy.name = 'Recoverable';
    values.set('musicmaker.project.v4', '{broken');
    values.set('musicmaker.project.v1', JSON.stringify(legacy));

    expect(loadProject().name).toBe('Recoverable');
  });

  it('migrates v2 projects and persists recognition provenance in v4', () => {
    const legacy = createProject();
    delete (legacy as Partial<typeof legacy>).recognitionTakes;
    values.set('musicmaker.project.v2', JSON.stringify(legacy));
    const migrated = loadProject();
    expect(migrated.formatVersion).toBe(4);
    expect(migrated.recognitionTakes).toEqual([]);

    migrated.recognitionTakes = [{
      id: 'take-1',
      sourceSampleId: 'sample-1',
      mode: 'melody',
      modelId: 'local-yin-pitch-tracker',
      modelVersion: '1',
      createdAt: 123,
      tempoBpm: 120,
      pitchCorrection: 0,
      scaleAwarePitch: false,
      scaleRoot: 0,
      scaleId: 'major',
      transposeSemitones: 0,
      tempoAlternatives: [60],
      quantisation: { enabled: true, strength: 0.75, subdivision: 'sixteenth' },
      originalEvents: [{
        id: 'note-1', pitch: 69, startSeconds: 0.13, durationSeconds: 0.5,
        velocity: 0.8, confidence: 0.6,
      }],
      quantisedEvents: [{
        id: 'note-1', pitch: 69, startSeconds: 0.125, durationSeconds: 0.5,
        velocity: 0.8, confidence: 0.6,
      }],
      channelIds: ['ch2'],
    }];
    saveProject(migrated);
    expect(loadProject().recognitionTakes).toEqual(migrated.recognitionTakes);
  });

  it('migrates v3 projects and preserves valid generated-track metadata', () => {
    const legacy = createProject();
    legacy.formatVersion = 3;
    legacy.channels[0].generatedMetadata = {
      generatedBy: 'arrangement-assistant',
      kind: 'chord-suggestions',
      sourceChannelId: 'ch2',
      confidence: 1.4,
    };
    values.set('musicmaker.project.v3', JSON.stringify(legacy));

    const migrated = loadProject();
    expect(migrated.formatVersion).toBe(4);
    expect(migrated.channels[0].generatedMetadata).toEqual({
      generatedBy: 'arrangement-assistant',
      kind: 'chord-suggestions',
      sourceChannelId: 'ch2',
      confidence: 1,
    });
  });

  it('round-trips generated metadata on tracks and pattern snapshots', () => {
    const project = createProject();
    const metadata = {
      generatedBy: 'arrangement-assistant' as const,
      kind: 'chord-suggestions' as const,
      sourceChannelId: 'ch1',
      confidence: 0.82,
    };
    project.channels[0].generatedMetadata = metadata;
    project.patterns = [{
      id: 'pattern-1',
      name: 'Verse',
      channels: [{ ...project.channels[0], steps: [...project.channels[0].steps], notes: [...project.channels[0].notes] }],
      lengthSteps: 16,
    }];
    saveProject(project);

    const loaded = loadProject();
    expect(loaded.channels[0].generatedMetadata).toEqual(metadata);
    expect(loaded.patterns[0].channels[0].generatedMetadata).toEqual(metadata);
  });

  it('round-trips bass-generation metadata without a project-format migration', () => {
    const project = createProject();
    const metadata = {
      generatedBy: 'arrangement-assistant' as const,
      kind: 'bass-generation' as const,
      sourceChannelId: 'ch1',
      confidence: 0.74,
    };
    project.channels[0].generatedMetadata = metadata;
    saveProject(project);

    expect(loadProject().channels[0].generatedMetadata).toEqual(metadata);
  });

  it('round-trips harmony and accompaniment metadata', () => {
    for (const kind of ['harmony-generation', 'accompaniment-generation'] as const) {
      const project = createProject();
      const metadata = { generatedBy: 'arrangement-assistant' as const, kind, sourceChannelId: 'ch1', confidence: 0.8 };
      project.channels[0].generatedMetadata = metadata;
      saveProject(project);
      expect(loadProject().channels[0].generatedMetadata).toEqual(metadata);
    }
  });

  it('discards malformed generated-track metadata during load', () => {
    const legacy = createProject();
    legacy.channels[0].generatedMetadata = {
      generatedBy: 'arrangement-assistant',
      kind: 'chord-suggestions',
      sourceChannelId: '',
      confidence: Number.NaN,
    };
    values.set('musicmaker.project.v4', JSON.stringify(legacy));

    expect(loadProject().channels[0].generatedMetadata).toBeUndefined();
  });
});
