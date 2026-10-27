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
    expect(loaded.formatVersion).toBe(2);
    expect(loaded.channels[0].soundId).toBe('legacy-custom-id');
    expect(loaded.customSounds[0].sampleId).toBe('legacy-sample-id');
  });

  it('prefers v2 projects and saves the current format version', () => {
    const legacy = createProject();
    legacy.name = 'Legacy';
    const current = createProject();
    current.name = 'Current';
    values.set('musicmaker.project.v1', JSON.stringify(legacy));
    values.set('musicmaker.project.v2', JSON.stringify(current));

    expect(loadProject().name).toBe('Current');
    saveProject(current);
    const saved = JSON.parse(values.get('musicmaker.project.v2')!) as { formatVersion: number };
    expect(saved.formatVersion).toBe(2);
  });

  it('round-trips optional kit roles without changing the project format version', () => {
    const project = createProject();
    project.channels[0].kitId = 'studio-kit';
    project.channels[0].role = 'kick';
    saveProject(project);

    const loaded = loadProject();
    expect(loaded.formatVersion).toBe(2);
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
    values.set('musicmaker.project.v2', JSON.stringify(older));
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
    values.set('musicmaker.project.v2', JSON.stringify(older));
    expect(loadProject().channels[0].stepEventMetadata).toEqual({});
  });

  it('falls back to the legacy project when the v2 entry is corrupt', () => {
    const legacy = createProject();
    legacy.name = 'Recoverable';
    values.set('musicmaker.project.v2', '{broken');
    values.set('musicmaker.project.v1', JSON.stringify(legacy));

    expect(loadProject().name).toBe('Recoverable');
  });
});
