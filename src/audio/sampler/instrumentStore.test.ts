import { describe, expect, it } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { createChannel, createProject, type SoundDef } from '../../model/project';
import { BUDGETS, instrumentNeeds, regionsForNotes } from './instrumentStore';
import { validateManifest, type InstrumentManifest } from './manifest';
import { diskStore, PUBLIC_DIR } from './testing';

const sine: SoundDef = {
  id: 'sampled-sine', name: 'Sine', category: 'Keys', params: { wave: 'sine', freq: 440, freqEnd: 440, decay: 0.1, cutoff: 12000 },
  instrumentId: 'test-sine', instrumentNote: 60, playbackMode: 'notes',
};

describe('InstrumentStore', () => {
  it('loads a bundled instrument and reports loading then ready', async () => {
    const store = diskStore();
    const states: (string | undefined)[] = [];
    store.subscribe(() => states.push(store.status('test-sine')?.state));
    expect(await store.ensure('test-sine')).toBe(true);
    expect(states).toEqual(['loading', 'ready']);
    const manifest = store.manifest('test-sine')!;
    expect(manifest.regions.every((region) => store.audio(manifest, region)?.data.length)).toBe(true);
    expect(store.decodedBytes).toBeGreaterThan(0);
  });

  it('loads only the regions needed by on-demand instruments', async () => {
    const store = diskStore();
    const manifest = JSON.parse(readFileSync(new URL('instruments/test-sine/manifest.json', PUBLIC_DIR), 'utf8')) as InstrumentManifest;
    expect(regionsForNotes({ ...manifest, preloadStrategy: 'on-demand' }, new Set([60])).map((region) => region.id)).toEqual(['sine-60']);
    await store.ensure('test-sine', new Set([60]));
    // test-sine preloads everything, so all three regions are present.
    expect(store.exportAudio(['test-sine']).regions).toHaveLength(3);
  });

  it('marks an instrument unavailable when a file is missing or the manifest is invalid', async () => {
    const store = diskStore(BUDGETS, { missing: ['sine-72.wav'] });
    expect(await store.ensure('test-sine')).toBe(false);
    expect(store.status('test-sine')).toEqual({ state: 'error', message: 'Missing sample sine-72.wav' });
    const bad = diskStore();
    expect(await bad.ensure('no-such-instrument')).toBe(false);
    expect(await bad.ensure('../escape')).toBe(false);
    expect(bad.status('../escape')?.message).toBe('Invalid instrument id');
  });

  it('enforces the per-instrument memory budget', async () => {
    const store = diskStore({ ...BUDGETS, instrumentDecodedBytes: 30000 });
    expect(await store.ensure('test-sine')).toBe(false);
    expect(store.status('test-sine')?.message).toBe('Instrument exceeds its memory budget');
  });

  it('evicts least-recently-used audio beyond the global budget but keeps what the project needs', async () => {
    const store = diskStore({ ...BUDGETS, totalDecodedBytes: 30000 });
    await store.prepare(new Map([['test-sine', new Set([60])]]));
    // All three regions are pinned (preloadStrategy "all"), so nothing is evicted.
    expect(store.exportAudio(['test-sine']).regions).toHaveLength(3);
    await store.prepare(new Map());
    expect(store.decodedBytes).toBeLessThanOrEqual(30000);
  });

  it('collects the notes each sampled instrument needs, across patterns', () => {
    const project = createProject();
    project.customSounds = [sine, { ...sine, id: 'sampled-sine-chords', playbackMode: 'chord' }];
    project.channels = [{
      ...createChannel('a', 'Sine', 'sampled-sine'),
      steps: [true],
      notes: [{ id: 'n', step: 0, pitch: 67, durationSteps: 1 }],
    }, {
      ...createChannel('c', 'Chords', 'sampled-sine-chords'),
      chordEvents: [{ id: 'c', step: 0, root: 48, quality: 'major', articulation: 'sustained', durationSteps: 1 }],
    }];
    project.patterns = [{ id: 'p2', name: 'P2', lengthSteps: 16, channels: [{ ...createChannel('b', 'S', 'sampled-sine'), notes: [{ id: 'm', step: 0, pitch: 50, durationSteps: 1 }] }] }];
    const notes = instrumentNeeds(project).get('test-sine')!;
    // The C major chord uses the open shape: C3 E3 G3 C4 E4.
    expect([...notes].sort((a, b) => a - b)).toEqual([48, 50, 52, 55, 60, 64, 67]);
  });
});

describe('bundled instruments', () => {
  const root = new URL('instruments/', PUBLIC_DIR);
  const ids = readdirSync(root).filter((name) => statSync(new URL(name, root)).isDirectory());
  it('are all valid, redistributable and within the download budgets', () => {
    let total = 0;
    for (const id of ids) {
      const dir = new URL(`${id}/`, root);
      const files = readdirSync(dir);
      expect(files).toContain('LICENCE.txt');
      const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8')) as InstrumentManifest;
      expect(manifest.id).toBe(id);
      expect(validateManifest(manifest, { files: new Set(files), bundled: true }).errors).toEqual([]);
      const size = files.reduce((sum, file) => sum + statSync(new URL(file, dir)).size, 0);
      expect(size).toBeLessThanOrEqual(BUDGETS.instrumentDownloadBytes);
      total += size;
    }
    expect(total).toBeLessThanOrEqual(BUDGETS.totalDownloadBytes);
  });
});
