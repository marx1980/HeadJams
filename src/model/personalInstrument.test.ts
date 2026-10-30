import { describe, expect, it } from 'vitest';
import { addPersonalInstrument, personalAudio, personalManifest, rootFromNotes } from './personalInstrument';
import { createChannel, createProject } from './project';
import { InstrumentStore } from '../audio/sampler/instrumentStore';
import { validateManifest } from '../audio/sampler/manifest';
import { renderProject } from '../audio/render';
import { instrumentNeeds } from '../audio/sampler/instrumentStore';

const sine = (freq: number, seconds = 1, rate = 22050) => Float32Array.from({ length: seconds * rate }, (_, i) => Math.sin(2 * Math.PI * freq * i / rate) * 0.5);
const pitchOf = (data: Float32Array, rate: number, from: number, to: number) => {
  let crossings = 0; let first = -1; let last = -1;
  for (let i = from + 1; i < to; i++) if (data[i - 1] < 0 && data[i] >= 0) { if (first < 0) first = i; last = i; crossings++; }
  return 69 + 12 * Math.log2(((crossings - 1) / ((last - first) / rate)) / 440);
};

describe('personal instruments', () => {
  it('maps samples to key ranges that meet halfway, and validates as a sampler manifest', () => {
    const manifest = personalManifest({ id: 'mine-1', name: 'Mine', samples: [{ sampleId: 'b', rootMidi: 67 }, { sampleId: 'a', rootMidi: 60 }] });
    expect(manifest.regions.map((r) => [r.file, r.rootMidi, r.lowMidi, r.highMidi])).toEqual([
      ['sample-a', 60, 48, 63], ['sample-b', 67, 64, 79],
    ]);
    expect(validateManifest(manifest, { bundled: false }).errors).toEqual([]);
  });

  it('finds the note a recording sounds at', () => {
    expect(rootFromNotes([{ pitch: 59.8, durationSeconds: 0.9 }, { pitch: 72, durationSeconds: 0.1 }])).toBe(60);
    expect(rootFromNotes([])).toBeUndefined();
  });

  it('adds a playable sound; registered audio plays at the right pitch in export, and re-registering replaces it', async () => {
    const { project, sound } = addPersonalInstrument(createProject('p'), 'Hum Synth', [{ sampleId: 's1', rootMidi: 69 }]);
    expect(sound).toMatchObject({ id: 'mine-1', instrumentId: 'mine-1', category: 'Mine', playbackMode: 'notes' });
    const p = { ...project, channels: [{ ...createChannel('c', 'Mine', 'mine-1'), notes: [{ id: 'n', step: 0, pitch: 76, durationSteps: 8 }] }] };
    const store = new InstrumentStore({ baseUrl: '/', fetchJson: async () => { throw new Error('no fetch'); }, fetchBytes: async () => { throw new Error('no fetch'); }, decode: async () => { throw new Error('no'); } });
    const instrument = p.personalInstruments![0];
    store.register(personalManifest(instrument), personalAudio(instrument, new Map([['s1', { samples: sine(440), sampleRate: 22050 }]])));
    await store.prepare(instrumentNeeds(p));
    expect(store.status('mine-1')?.state).toBe('ready');
    const audio = store.exportAudio(['mine-1']);
    const out = renderProject(p, 22050, new Map(), { manifests: new Map(audio.manifests.map((m) => [m.id, m])), regions: new Map(audio.regions.map((r) => [r.key, r])) }).left;
    expect(pitchOf(out, 22050, 2000, 8000)).toBeCloseTo(76, 0);
    store.register(personalManifest(instrument), new Map());
    expect(store.status('mine-1')?.state).toBe('error');
    expect(store.exportAudio(['mine-1']).regions).toEqual([]);
  });
});
