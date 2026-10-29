import { describe, expect, it } from 'vitest';
import { createChannel, createProject, type Project, type SoundDef } from '../../model/project';
import { renderProject, type InstrumentAudio } from '../render';
import type { HitVoice, PitchedVoice } from '../performance';
import type { InstrumentManifest } from './manifest';
import { cutGainAt, envelopeAt, planSampledVoice, renderSampledVoice } from './sampledVoice';
import { RoundRobin } from './selectRegion';
import { diskStore } from './testing';
import { CUT_FADE_SEC } from './voices';

const sound = (extra: Partial<SoundDef> = {}): SoundDef => ({
  id: 'sampled-sine', name: 'Sine', category: 'Keys', params: { wave: 'sine', freq: 440, freqEnd: 440, decay: 0.1, cutoff: 12000 },
  instrumentId: 'test-sine', instrumentNote: 60, playbackMode: 'notes', ...extra,
});

async function loaded(): Promise<{ manifest: InstrumentManifest; audio: InstrumentAudio }> {
  const store = diskStore();
  await store.ensure('test-sine');
  const { manifests, regions } = store.exportAudio(['test-sine']);
  return {
    manifest: manifests[0],
    audio: { manifests: new Map(manifests.map((m) => [m.id, m])), regions: new Map(regions.map((r) => [r.key, r])) },
  };
}

/** Dominant frequency estimate from upward zero crossings. */
function frequency(data: Float32Array, sr: number, from: number, to: number): number {
  let crossings = 0;
  let first = -1;
  let last = -1;
  for (let i = from + 1; i < to; i++) {
    if (data[i - 1] < 0 && data[i] >= 0) {
      if (first < 0) first = i;
      last = i;
      crossings++;
    }
  }
  return (crossings - 1) / ((last - first) / sr);
}

describe('sampled voices', () => {
  it('plans grid hits as one-shots at the instrument note and full velocity', async () => {
    const { manifest, audio } = await loaded();
    const hit: HitVoice = { kind: 'hit', sound: sound(), channelId: 'c', offsetSec: 0, volume: 0.5, pan: 0 };
    const plan = planSampledVoice(hit, manifest, (r) => audio.regions.get(`test-sine@1/${r.file}`))!;
    expect(plan.region.id).toBe('sine-60');
    expect(plan.mode).toBe('one-shot');
    expect(plan.rate).toBe(1);
    expect(plan.level).toBeCloseTo(0.5);
    expect(plan.endSec).toBeCloseTo(0.15);
  });

  it('renders at the requested pitch, including transposition within the limit', async () => {
    const { manifest, audio } = await loaded();
    const note: PitchedVoice = { kind: 'pitched', origin: 'note', sound: sound(), channelId: 'c', offsetSec: 0, volume: 1, pan: 0, pitch: 64, durationSec: 0.2 };
    const plan = planSampledVoice(note, manifest, (r) => audio.regions.get(`test-sine@1/${r.file}`))!;
    expect(plan.region.id).toBe('sine-60');
    const out = renderSampledVoice(plan, 44100);
    const expected = 440 * 2 ** ((64 - 69) / 12);
    expect(frequency(out, 44100, 200, 3000)).toBeGreaterThan(expected * 0.98);
    expect(frequency(out, 44100, 200, 3000)).toBeLessThan(expected * 1.02);
  });

  it('fades cut voices over the cut fade and stops them', async () => {
    const { manifest, audio } = await loaded();
    const hit: HitVoice = { kind: 'hit', sound: sound(), channelId: 'c', offsetSec: 0, volume: 1, pan: 0 };
    const plan = planSampledVoice(hit, manifest, (r) => audio.regions.get(`test-sine@1/${r.file}`))!;
    const out = renderSampledVoice(plan, 44100, 0.05);
    expect(out.length).toBe(Math.ceil((0.05 + CUT_FADE_SEC) * 44100));
    expect(cutGainAt(0.04, 0.05)).toBe(1);
    expect(cutGainAt(0.055, 0.05)).toBeCloseTo(0.5);
    expect(cutGainAt(0.07, 0.05)).toBe(0);
  });

  it('shapes sustain notes with attack and release', () => {
    const plan = { mode: 'sustain', attackSec: 0.01, durationSec: 0.1, releaseSec: 0.05, endSec: 0.15 } as Parameters<typeof envelopeAt>[0];
    expect(envelopeAt(plan, 0.005)).toBeCloseTo(0.5);
    expect(envelopeAt(plan, 0.05)).toBe(1);
    expect(envelopeAt(plan, 0.125)).toBeCloseTo(0.5);
    expect(envelopeAt(plan, 0.2)).toBe(0);
  });

  it('renders sampled channels in WAV export, deterministically', async () => {
    const { audio } = await loaded();
    const project: Project = createProject();
    project.customSounds = [sound()];
    project.channels = [{ ...createChannel('s', 'Sine', 'sampled-sine'), steps: [true, false, false, false, true, false, false, false, false, false, false, false, false, false, false, false] }];
    const a = renderProject(project, 44100, new Map(), audio);
    const b = renderProject(project, 44100, new Map(), audio);
    expect(a.left).toEqual(b.left);
    const step = Math.round(44100 * 60 / project.bpm / 4);
    const peak = (from: number, to: number) => a.left.slice(from, to).reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    expect(peak(0, 2000)).toBeGreaterThan(0.1);
    expect(peak(4 * step, 4 * step + 2000)).toBeGreaterThan(0.1);
    expect(peak(3 * step, 4 * step - 10)).toBeLessThan(0.01);
    const silent = renderProject(project, 44100);
    expect(silent.left.every((value) => value === 0)).toBe(true);
  });

  it('uses the same round-robin sequence for the same seed', async () => {
    const { manifest, audio } = await loaded();
    const rr = manifest.regions.map((r, i) => ({ ...r, id: `rr${i}`, lowMidi: 54, highMidi: 65, roundRobinGroup: 'g', roundRobinIndex: i }));
    const m = { ...manifest, regions: rr };
    const hit: HitVoice = { kind: 'hit', sound: sound(), channelId: 'c', offsetSec: 0, volume: 1, pan: 0 };
    const ids = (seed: number) => {
      const robin = new RoundRobin(seed);
      return [0, 1, 2, 3].map(() => planSampledVoice(hit, m, (r) => audio.regions.get(`test-sine@1/${r.file}`), robin)!.region.id);
    };
    expect(ids(3)).toEqual(ids(3));
  });
});
