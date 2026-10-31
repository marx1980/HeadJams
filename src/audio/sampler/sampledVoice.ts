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
  chokeKey?: string | string[];
  /** Sustained regions with loop points keep playing between them until the note is released. */
  loop?: { startSec: number; endSec: number };
  /** Seconds into the file to start from (slurred notes skip their attack). */
  startSec?: number;
  /** Level multiplier over the voice (phrasing swells), linearly interpolated. */
  gainCurve?: PitchBendPoint[];
}

/** A slurred note skips at most this much of its sample's attack. */
const LEGATO_MAX_SKIP_SEC = 0.35;
const LEGATO_ATTACK_SEC = 0.03;
const steadyStarts = new WeakMap<Float32Array, number>();

/**
 * Where a sample reaches its steady level (70% of its sustained loudness), so a slurred note can start there
 * instead of replaying the attack. Measured once per region in 10 ms windows.
 */
export function steadyStartSec(audio: DecodedRegion, loop?: { startSec: number; endSec: number }): number {
  const cached = steadyStarts.get(audio.data);
  if (cached !== undefined) return cached;
  const { data, sampleRate } = audio;
  const rms = (from: number, to: number) => {
    const a = Math.max(0, Math.floor(from * sampleRate));
    const b = Math.min(data.length, Math.floor(to * sampleRate));
    let sum = 0;
    for (let i = a; i < b; i++) sum += data[i] * data[i];
    return b > a ? Math.sqrt(sum / (b - a)) : 0;
  };
  const fileSec = data.length / sampleRate;
  const target = loop ? rms(loop.startSec, loop.endSec) : rms(Math.min(0.15, fileSec / 4), Math.min(0.6, fileSec / 2));
  const limit = Math.min(LEGATO_MAX_SKIP_SEC, loop ? loop.endSec - 0.05 : fileSec / 3);
  let start = limit;
  for (let t = 0; t < limit; t += 0.01) {
    if (rms(t, t + 0.01) >= target * 0.7) { start = t; break; }
  }
  start = Math.max(0.02, start);
  steadyStarts.set(audio.data, start);
  return start;
}

/** Grid hits use the middle velocity layer by default, leaving the loudest layer for accents. */
export const DEFAULT_HIT_VELOCITY = 100;
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
    velocity: pitched ? midiVelocity(voice.velocity) : Math.max(1, Math.min(127, Math.round(voice.sound.instrumentVelocity ?? DEFAULT_HIT_VELOCITY))),
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
  const fileSec = audio.data.length / audio.sampleRate;
  const { loopStartMs, loopEndMs } = choice.region;
  const loop = mode === 'sustain' && loopStartMs !== undefined && loopEndMs !== undefined
    && loopStartMs >= 0 && loopEndMs - loopStartMs >= 10 && loopEndMs / 1000 <= fileSec + 1e-3
    ? { startSec: loopStartMs / 1000, endSec: Math.min(fileSec, loopEndMs / 1000) }
    : undefined;
  const expression = pitched ? voice.expression : undefined;
  const startSec = expression?.legato ? steadyStartSec(audio, loop) : 0;
  const release = expression?.releaseSec !== undefined && Number.isFinite(expression.releaseSec)
    ? Math.max(0.005, expression.releaseSec) : releaseSec;
  const naturalSec = loop ? Number.POSITIVE_INFINITY : (fileSec - startSec) / choice.rate;
  const endSec = mode === 'sustain' ? Math.min(naturalSec, durationSec + release) : naturalSec;
  const gainCurve = expression?.gain?.length ? sanitizeBends(expression.gain).map((point) => ({ ...point, value: Math.max(0, point.value) })) : undefined;
  return {
    region: choice.region,
    audio,
    rate: choice.rate,
    level: Math.max(0, voice.volume * velocity * choice.gain),
    mode,
    durationSec,
    attackSec: expression?.legato ? Math.min(attackSec, LEGATO_ATTACK_SEC) : attackSec,
    releaseSec: release,
    noteEndSec: mode === 'sustain' ? Math.min(durationSec, endSec) : 0,
    endSec,
    pitchBend: pitched ? voice.pitchBend : undefined,
    ...(loop ? { loop } : {}),
    ...(startSec > 0 ? { startSec } : {}),
    ...(gainCurve ? { gainCurve } : {}),
    chokeKey: choice.region.chokeGroup
      ? `${manifest.id}:${choice.region.chokeGroup}`
      // Guitar keys are per channel (not per instrument), so recorded and built chords on one track cut each other.
      : pitched && voice.chokeKey
        ? (typeof voice.chokeKey === 'string' ? [voice.chokeKey] : voice.chokeKey).map((key) => `${voice.channelId}:${key}`)
        : undefined,
  };
}

/** Envelope gain (0–1) at `t` seconds after the voice start, before level and cuts. */
export function envelopeAt(plan: SampledVoicePlan, t: number): number {
  if (t < 0 || t >= plan.endSec) return 0;
  const attack = plan.attackSec > 0 ? Math.min(1, t / plan.attackSec) : 1;
  const swell = plan.gainCurve ? curveAt(plan.gainCurve, t) : 1;
  if (plan.mode === 'one-shot' || t <= plan.durationSec) return attack * swell;
  return attack * swell * Math.max(0, 1 - (t - plan.durationSec) / Math.max(1e-6, plan.releaseSec));
}

/** Value of a sorted, linearly interpolated curve at `t` (held before the first and after the last point). */
export function curveAt(curve: readonly PitchBendPoint[], t: number): number {
  if (!curve.length) return 1;
  if (t <= curve[0].time) return curve[0].value;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (t <= b.time) return b.time > a.time ? a.value + (b.value - a.value) * ((t - a.time) / (b.time - a.time)) : b.value;
  }
  return curve[curve.length - 1].value;
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
  let position = (plan.startSec ?? 0) * sampleRate;
  const loopStart = plan.loop ? plan.loop.startSec * sampleRate : 0;
  const loopEnd = plan.loop ? Math.min(data.length - 1, plan.loop.endSec * sampleRate) : 0;
  for (let i = 0; i < length; i++) {
    if (plan.loop) while (position >= loopEnd) position -= loopEnd - loopStart;
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
