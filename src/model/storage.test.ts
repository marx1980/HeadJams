import { describe, expect, it } from 'vitest';
import { addCustomSound, createProject, PROJECT_FORMAT_VERSION } from './project';
import { migrateProject } from './storage';

describe('project format migration', () => {
  it('upgrades a legacy project while retaining sounds and composition', () => {
    const legacy = addCustomSound(createProject('Legacy'), 'My tone', {
      wave: 'sine', freq: 220, freqEnd: 110, decay: 0.3, cutoff: 4000,
    }).project;
    const migrated = migrateProject({
      ...legacy,
      formatVersion: undefined,
      channels: [{ ...legacy.channels[0], soundId: 'kick-1', steps: [true, false] }],
    });
    expect(migrated?.formatVersion).toBe(PROJECT_FORMAT_VERSION);
    expect(migrated?.name).toBe('Legacy');
    expect(migrated?.channels[0]).toMatchObject({ soundId: 'kick-1', steps: [true, false] });
    expect(migrated?.customSounds).toEqual(legacy.customSounds);
  });

  it('preserves unknown sound IDs for replacement instead of silently substituting', () => {
    const project = createProject();
    const migrated = migrateProject({
      ...project,
      channels: [{ ...project.channels[0], soundId: 'missing-instrument' }],
    });
    expect(migrated?.channels[0].soundId).toBe('missing-instrument');
  });

  it('rejects invalid project data', () => {
    expect(migrateProject(null)).toBeUndefined();
    expect(migrateProject({ bpm: 120 })).toBeUndefined();
  });
});
