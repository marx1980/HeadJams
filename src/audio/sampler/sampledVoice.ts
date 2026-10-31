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
  /** A second, louder recording mixed in by `weight` over time (soft-to-loud tone). */
  blend?: {
    region: SampleRegion;
    audio: DecodedRegion;
    rate: number;
    gainRatio: number;
    weight: PitchBendPoint[];
    loop?: { startSec: number; endSec: number };
    startSec?: number;
  };
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
  const expression = pitched ? voice.expression : undefined;
  const articulation = expression?.articulation ?? voice.sound.instrumentArticulation;
  // Breath and key noise only play on instruments that have those recordings.
  if (expression?.optional && !manifest.regions.some((region) => region.articulation === articulation)) return undefined;
  const midi = pitched ? voice.pitch : voice.sound.instrumentNote ?? 60;
  const velocity = pitched && voice.velocity !== undefined && Number.isFinite(voice.velocity)
    ? Math.max(0, Math.min(1, voice.velocity))
    : 1;
  const request = {
    midi,
    velocity: pitched ? midiVelocity(voice.velocity) : Math.max(1, Math.min(127, Math.round(voice.sound.instrumentVelocity ?? DEFAULT_HIT_VELOCITY))),
    articulation,
  };
  // Blended notes start on the softest recording and move toward the loudest as the level rises.
  const soft = expression?.blend ? selectRegion(manifest, { ...request, velocity: 1 }, roundRobin) : undefined;
  const loud = soft ? selectRegion(manifest, { ...request, velocity: 127 }) : undefined;
  const blending = soft && loud && soft.region.id !== loud.region.id && loud.region.articulation === soft.region.articulation;
  const choice = blending ? soft : soft ?? selectRegion(manifest, request, roundRobin);
  if (!choice) return undefined;
  const audio = getAudio(choice.region);
  if (!audio || !audio.data.length || audio.sampleRate <= 0) return undefined;
  // Recordings of other articulations without loop points (staccato, breath, keys) play out as one-shots.
  const extraArticulation = choice.region.articulation !== manifest.defaultArticulation && choice.region.loopStartMs === undefined;
  const mode = pitched && !extraArticulation ? manifest.envelope?.mode ?? 'one-shot' : 'one-shot';
  const attackSec = (manifest.envelope?.attackMs ?? DEFAULT_ATTACK_MS) / 1000;
  const releaseSec = (manifest.envelope?.releaseMs ?? DEFAULT_RELEASE_MS) / 1000;
  const durationSec = pitched ? Math.max(0.01, voice.durationSec) : 0;
  const fileSec = audio.data.length / audio.sampleRate;
  const loopOf = (region: SampleRegion, seconds: number) => mode === 'sustain' && region.loopStartMs !== undefined && region.loopEndMs !== undefined
    && region.loopStartMs >= 0 && region.loopEndMs - region.loopStartMs >= 10 && region.loopEndMs / 1000 <= seconds + 1e-3
    ? { startSec: region.loopStartMs / 1000, endSec: Math.min(seconds, region.loopEndMs / 1000) }
    : undefined;
  const loop = loopOf(choice.region, fileSec);
  const legatoStart = (data: DecodedRegion, regionLoop: typeof loop) => {
    const steady = steadyStartSec(data, regionLoop);
    const limit = regionLoop ? regionLoop.endSec - 0.05 : data.data.length / data.sampleRate / 2;
    return Math.min(limit, steady + Math.max(0, expression?.startJitterSec ?? 0));
  };
  const startSec = expression?.legato ? legatoStart(audio, loop) : 0;
  const release = expression?.releaseSec !== undefined && Number.isFinite(expression.releaseSec)
    ? Math.max(0.005, expression.releaseSec) : releaseSec;
  // Breath and key noise are not pitched: play them as recorded.
  const rate = expression?.optional ? 1 : choice.rate;
  const naturalSec = loop ? Number.POSITIVE_INFINITY : (fileSec - startSec) / rate;
  const endSec = mode === 'sustain' ? Math.min(naturalSec, durationSec + release) : naturalSec;
  const gainCurve = expression?.gain?.length ? sanitizeBends(expression.gain).map((point) => ({ ...point, value: Math.max(0, point.value) })) : undefined;
  let blend: SampledVoicePlan['blend'];
  const loudAudio = blending ? getAudio(loud.region) : undefined;
  if (blending && loudAudio?.data.length && loudAudio.sampleRate > 0) {
    const loudSec = loudAudio.data.length / loudAudio.sampleRate;
    const loudLoop = loopOf(loud.region, loudSec);
    if (Boolean(loudLoop) === Boolean(loop)) {
      // Weight of the loud recording follows the played level (velocity × swell).
      const curve = gainCurve ?? [{ time: 0, value: 1 }];
      const weight = curve.map((point) => {
        const x = Math.max(0, Math.min(1, (velocity * point.value - 0.45) / 0.5));
        return { time: point.time, value: x * x * (3 - 2 * x) };
      });
      // Each recording keeps its own level, so rising into the loud one is both brighter and louder,
      // but never more than 9 dB above the soft one (some sets have very quiet soft layers).
      const natural = loud.gain / Math.max(1e-6, choice.gain);
      const spread = levelOf(loudAudio, loudLoop) / Math.max(1e-6, levelOf(audio, loop));
      const ratio = spread > 2.8 ? natural * (2.8 / spread) : natural;
      blend = {
        region: loud.region, audio: loudAudio, rate: loud.rate, gainRatio: Math.min(4, ratio), weight,
        ...(loudLoop ? { loop: loudLoop } : {}),
        ...(expression?.legato ? { startSec: legatoStart(loudAudio, loudLoop) } : {}),
      };
    }
  }
  return {
    region: choice.region,
    audio,
    rate,
    level: Math.max(0, voice.volume * velocity * choice.gain),
    mode,
    durationSec,
    attackSec: expression?.legato ? Math.min(attackSec, LEGATO_ATTACK_SEC) : attackSec,
    releaseSec: release,
    noteEndSec: mode === 'sustain' ? Math.min(durationSec, endSec) : 0,
    endSec,
    pitchBend: pitched && !expression?.optional ? voice.pitchBend : undefined,
    ...(loop ? { loop } : {}),
    ...(startSec > 0 ? { startSec } : {}),
    ...(gainCurve ? { gainCurve } : {}),
    ...(blend ? { blend } : {}),
    chokeKey: choice.region.chokeGroup
      ? `${manifest.id}:${choice.region.chokeGroup}`
      // Guitar keys are per channel (not per instrument), so recorded and built chords on one track cut each other.
      : pitched && voice.chokeKey
        ? (typeof voice.chokeKey === 'string' ? [voice.chokeKey] : voice.chokeKey).map((key) => `${voice.channelId}:${key}`)
        : undefined,
  };
}

const levels = new WeakMap<Float32Array, number>();
/** RMS level of a recording's sustained part (its loop, or 0.1–0.6 s). */
function levelOf(audio: DecodedRegion, loop?: { startSec: number; endSec: number }): number {
  const cached = levels.get(audio.data);
  if (cached !== undefined) return cached;
  const from = Math.floor((loop?.startSec ?? 0.1) * audio.sampleRate);
  const to = Math.min(audio.data.length, Math.floor((loop?.endSec ?? 0.6) * audio.sampleRate));
  let sum = 0;
  for (let i = from; i < to; i++) sum += audio.data[i] * audio.data[i];
  const value = to > from ? Math.sqrt(sum / (to - from)) : 0;
  levels.set(audio.data, value);
  return value;
}

/** Gains of the soft and loud recordings for a blend weight (equal power). */
export function blendGains(weight: number, gainRatio: number): [number, number] {
  const w = Math.max(0, Math.min(1, weight));
  return [Math.cos((w * Math.PI) / 2), Math.sin((w * Math.PI) / 2) * gainRatio];
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
  const bends = sanitizeBends(plan.pitchBend);
  const layers = [{ audio: plan.audio, rate: plan.rate, loop: plan.loop, startSec: plan.startSec ?? 0, which: 0 }];
  if (plan.blend) layers.push({ audio: plan.blend.audio, rate: plan.blend.rate, loop: plan.blend.loop, startSec: plan.blend.startSec ?? 0, which: 1 });
  for (const layer of layers) {
    const { data, sampleRate } = layer.audio;
    let bendIndex = 0;
    let currentBend = { time: 0, value: 0 };
    let position = layer.startSec * sampleRate;
    const loopStart = layer.loop ? layer.loop.startSec * sampleRate : 0;
    const loopEnd = layer.loop ? Math.min(data.length - 1, layer.loop.endSec * sampleRate) : 0;
    for (let i = 0; i < length; i++) {
      if (layer.loop) while (position >= loopEnd) position -= loopEnd - loopStart;
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
      const weight = plan.blend ? blendGains(curveAt(plan.blend.weight, time), plan.blend.gainRatio)[layer.which] : 1;
      output[i] += value * weight * plan.level * envelopeAt(plan, time) * cutGainAt(time, cutSec);
      position += sampleRate * layer.rate * 2 ** (semitones / 12) / sr;
    }
  }
  return output;
}
