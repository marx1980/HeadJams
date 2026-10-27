import type { PitchBendPoint, Project, SoundDef, SynthParams } from '../model/project';
import { pitchToFrequency } from '../model/music';
import { createInstrumentRegistry, STARTER_SOUNDS } from './instrumentRegistry';

export { STARTER_SOUNDS } from './instrumentRegistry';

export function allSounds(p: Pick<Project, 'customSounds'>): SoundDef[] {
  return createInstrumentRegistry(p.customSounds).map((entry) => entry.sound);
}

export function findSound(p: Pick<Project, 'customSounds'>, id: string): SoundDef | undefined {
  return allSounds(p).find((x) => x.id === id);
}

export const SAMPLE_RATE = 44100;

/** Pure-DSP synth: renders a one-shot sound to mono samples. */
export function renderSound(p: SynthParams, sr = SAMPLE_RATE): Float32Array {
  const decay = Math.max(0.01, p.decay);
  const len = Math.max(1, Math.floor(sr * Math.min(2, decay * 1.5)));
  const out = new Float32Array(len);
  const f0 = Math.max(10, p.freq);
  const f1 = Math.max(10, p.freqEnd);
  const a = 1 - Math.exp((-2 * Math.PI * Math.min(Math.max(50, p.cutoff), sr / 2 - 1)) / sr);
  let phase = 0, lp = 0, seed = 12345;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const f = f0 * Math.pow(f1 / f0, Math.min(1, t / decay));
    phase += f / sr;
    phase -= Math.floor(phase);
    let x: number;
    switch (p.wave) {
      case 'sine': x = Math.sin(2 * Math.PI * phase); break;
      case 'square': x = phase < 0.5 ? 1 : -1; break;
      case 'saw': x = 2 * phase - 1; break;
      case 'triangle': x = 4 * Math.abs(phase - 0.5) - 1; break;
      default:
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        x = seed / 2147483648 - 1;
    }
    lp += a * (x - lp);
    const fade = Math.min(1, (len - i) / 200);
    out[i] = lp * Math.exp((-5 * t) / decay) * 0.9 * fade;
  }
  return out;
}

export function renderPitchedNote(
  p: SynthParams,
  pitch: number,
  duration: number,
  velocity = 1,
  sr = SAMPLE_RATE,
  pitchBend: PitchBendPoint[] = [],
): Float32Array {
  const noteDuration = Math.max(0.01, duration);
  const attack = 0.008;
  const release = 0.03;
  const len = Math.max(1, Math.ceil(sr * (noteDuration + release)));
  const out = new Float32Array(len);
  const freq = pitchToFrequency(Math.max(0, Math.min(127, Math.round(pitch))));
  const cutoff = Math.min(Math.max(50, p.cutoff), sr / 2 - 1);
  const filter = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
  const level = Math.max(0, Math.min(1, velocity));
  const bends = pitchBend.filter((point) => Number.isFinite(point.time) && point.time >= 0
    && Number.isFinite(point.value)).map((point) => ({ ...point, value: Math.max(-48, Math.min(48, point.value)) }))
    .sort((a, b) => a.time - b.time);
  let phase = 0;
  let low = 0;
  let bendIndex = 0;
  let bendValue = 0;
  for (let i = 0; i < len; i++) {
    const time = i / sr;
    while (bendIndex < bends.length && bends[bendIndex].time <= time) {
      bendValue = bends[bendIndex].value;
      bendIndex++;
    }
    phase += freq * 2 ** (bendValue / 12) / sr;
    phase -= Math.floor(phase);
    let sample: number;
    switch (p.wave) {
      case 'sine': sample = Math.sin(2 * Math.PI * phase); break;
      case 'square': sample = phase < 0.5 ? 1 : -1; break;
      case 'saw': sample = 2 * phase - 1; break;
      case 'triangle': sample = 4 * Math.abs(phase - 0.5) - 1; break;
      default:
        sample = Math.sin(2 * Math.PI * phase);
    }
    low += filter * (sample - low);
    const envelope = time < attack
      ? time / attack
      : time <= noteDuration
        ? 1
        : Math.exp((-6 * (time - noteDuration)) / release);
    out[i] = low * envelope * level * 0.35;
  }
  return out;
}
