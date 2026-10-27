import { describe, expect, it } from 'vitest';
import { STARTER_SOUNDS } from './sounds';
import { createInstrumentRegistry, migrateSoundId, validateInstrumentRegistry } from './instrumentRegistry';

describe('instrument registry', () => {
  it('retains existing IDs and groups existing sounds without changing their definitions', () => {
    const registry = createInstrumentRegistry(STARTER_SOUNDS);
    expect(registry.entries).toHaveLength(STARTER_SOUNDS.length);
    expect(registry.issues).toEqual([]);
    expect(migrateSoundId('kick-1')).toBe('kick-1');
    expect(registry.entries.find((sound) => sound.id === 'kick-1')).toMatchObject({
      group: 'Drums', soundType: 'percussion', playbackMode: 'one-shot', source: { kind: 'synth' },
    });
    expect(registry.entries.find((sound) => sound.id === 'bass-1')?.params).toEqual(STARTER_SOUNDS.find((sound) => sound.id === 'bass-1')?.params);
  });

  it('reports duplicate IDs and sample references without available assets', () => {
    const sample = { ...STARTER_SOUNDS[0], id: 'sample-test', sampleId: 'asset-missing' };
    const registry = createInstrumentRegistry([sample, { ...sample }], new Set());
    expect(registry.issues).toEqual([
      { code: 'missing-asset', soundId: 'sample-test' },
      { code: 'duplicate-id', soundId: 'sample-test' },
      { code: 'missing-asset', soundId: 'sample-test' },
    ]);
    expect(registry.entries).toHaveLength(1);
    expect(registry.entries[0].available).toBe(false);
    expect(validateInstrumentRegistry(registry.entries, new Set())).toContainEqual({ code: 'missing-asset', soundId: 'sample-test' });
  });

  it('keeps unknown legacy IDs unchanged for missing-sound handling', () => {
    expect(migrateSoundId('retired-sound')).toBe('retired-sound');
  });
});
