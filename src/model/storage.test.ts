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

  it('falls back to the legacy project when the v2 entry is corrupt', () => {
    const legacy = createProject();
    legacy.name = 'Recoverable';
    values.set('musicmaker.project.v2', '{broken');
    values.set('musicmaker.project.v1', JSON.stringify(legacy));

    expect(loadProject().name).toBe('Recoverable');
  });
});
