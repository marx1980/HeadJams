import type { PitchBendPoint } from '../../model/project';
import type { VoiceEvent } from '../performance';
import type { InstrumentManifest, SampleRegion } from './manifest';
import { midiVelocity, selectRegion, type RoundRobin } from './selectRegion';
import { CUT_FADE_SEC } from './voices';

/** Decoded mono audio for one region. `buffer` is set in the browser and shares memory with `data`. */
export interface DecodedRegion {
  sampleRate: number;
  data: Float32Array;
  buffer?: AudioBuffer;
}

export interface SampledVoicePlan {
  region: SampleRegion;
  audio: DecodedRegion;
  rate: number;
  level: number;
  mode: 'one-shot' | 'sustain';
  durationSec: number;
  attackSec: number;
  releaseSec: number;
  /** Seconds after the voice start when the note is released. */
  noteEndSec: number;
  /** Seconds after the voice start when the voice is silent (before any cut). */
  endSec: number;
  pitchBend?: PitchBendPoint[];
  chokeKey?: string;
}

const DEFAULT_ATTACK_MS = 2;
const DEFAULT_RELEASE_MS = 30;

/** Resolve a voice event on a sampled instrument to the region and envelope it should play. */
export function planSampledVoice(
  voice: VoiceEvent,
  manifest: InstrumentManifest,
  getAudio: (region: SampleRegion) => DecodedRegion | undefined,
  roundRobin?: RoundRobin,
): SampledVoicePlan | undefined {
  const pitched = voice.kind === 'pitched';
  const midi = pitched ? voice.pitch : voice.sound.instrumentNote ?? 60;
  const choice = selectRegion(manifest, {
    midi,
    velocity: midiVelocity(pitched ? voice.velocity : undefined),
    articulation: voice.sound.instrumentArticulation,
  }, roundRobin);
  if (!choice) return undefined;
  const audio = getAudio(choice.region);
  if (!audio || !audio.data.length || audio.sampleRate <= 0) return undefined;
  const velocity = pitched && voice.velocity !== undefined && Number.isFinite(voice.velocity)
    ? Math.max(0, Math.min(1, voice.velocity))
    : 1;
  const mode = pitched ? manifest.envelope?.mode ?? 'one-shot' : 'one-shot';
  const attackSec = (manifest.envelope?.attackMs ?? DEFAULT_ATTACK_MS) / 1000;
  const releaseSec = (manifest.envelope?.releaseMs ?? DEFAULT_RELEASE_MS) / 1000;
  const durationSec = pitched ? Math.max(0.01, voice.durationSec) : 0;
  const naturalSec = audio.data.length / audio.sampleRate / choice.rate;
  const endSec = mode === 'sustain' ? Math.min(naturalSec, durationSec + releaseSec) : naturalSec;
  return {
    region: choice.region,
    audio,
    rate: choice.rate,
    level: Math.max(0, voice.volume * velocity * choice.gain),
    mode,
    durationSec,
    attackSec,
    releaseSec,
    noteEndSec: mode === 'sustain' ? Math.min(durationSec, endSec) : 0,
    endSec,
    pitchBend: pitched ? voice.pitchBend : undefined,
    chokeKey: choice.region.chokeGroup ? `${manifest.id}:${choice.region.chokeGroup}` : undefined,
  };
}

/** Envelope gain (0–1) at `t` seconds after the voice start, before level and cuts. */
export function envelopeAt(plan: SampledVoicePlan, t: number): number {
  if (t < 0 || t >= plan.endSec) return 0;
  const attack = plan.attackSec > 0 ? Math.min(1, t / plan.attackSec) : 1;
  if (plan.mode === 'one-shot' || t <= plan.durationSec) return attack;
  return attack * Math.max(0, 1 - (t - plan.durationSec) / Math.max(1e-6, plan.releaseSec));
}

/** Gain of a voice cut at `cutSec` (relative to its start). */
export function cutGainAt(t: number, cutSec: number | undefined): number {
  if (cutSec === undefined || t < cutSec) return 1;
  return Math.max(0, 1 - (t - cutSec) / CUT_FADE_SEC);
}

export function sanitizeBends(bends: readonly PitchBendPoint[] | undefined): PitchBendPoint[] {
  return (bends ?? []).filter((point) => Number.isFinite(point.time) && point.time >= 0 && Number.isFinite(point.value))
    .map((point) => ({ ...point, value: Math.max(-48, Math.min(48, point.value)) }))
    .sort((a, b) => a.time - b.time);
}

/** Offline render of one sampled voice (mono, at `sr`), including bends, envelope and an optional cut. */
export function renderSampledVoice(plan: SampledVoicePlan, sr: number, cutSec?: number): Float32Array {
  const stopSec = cutSec === undefined ? plan.endSec : Math.min(plan.endSec, cutSec + CUT_FADE_SEC);
  const length = Math.max(0, Math.ceil(stopSec * sr));
  const output = new Float32Array(length);
  const { data, sampleRate } = plan.audio;
  const bends = sanitizeBends(plan.pitchBend);
  let bendIndex = 0;
  let currentBend = { time: 0, value: 0 };
  let position = 0;
  for (let i = 0; i < length; i++) {
    if (position >= data.length - 1) break;
    const time = i / sr;
    while (bendIndex < bends.length && bends[bendIndex].time <= time) currentBend = bends[bendIndex++];
    const nextBend = bends[bendIndex];
    const bendMix = nextBend && nextBend.time > currentBend.time
      ? Math.min(1, (time - currentBend.time) / (nextBend.time - currentBend.time))
      : 0;
    const semitones = currentBend.value + ((nextBend?.value ?? currentBend.value) - currentBend.value) * bendMix;
    const index = Math.floor(position);
    const frac = position - index;
    const value = data[index] * (1 - frac) + data[index + 1] * frac;
    output[i] = value * plan.level * envelopeAt(plan, time) * cutGainAt(time, cutSec);
    position += sampleRate * plan.rate * 2 ** (semitones / 12) / sr;
  }
  return output;
}
