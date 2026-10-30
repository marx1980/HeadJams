import type { InstrumentManifest, SampleRegion } from './manifest';

export interface RegionRequest {
  midi: number;
  /** MIDI velocity, 1–127. */
  velocity: number;
  articulation?: string;
}

export interface RegionChoice {
  region: SampleRegion;
  /** Playback-rate multiplier relative to the region's root (before pitch bend). */
  rate: number;
  /** Linear gain from manifest and region level offsets. */
  gain: number;
}

export const dbToGain = (db: number): number => 10 ** (db / 20);

/** Convert a 0–1 project velocity (undefined = full) to MIDI 1–127. */
export function midiVelocity(velocity: number | undefined): number {
  const value = velocity === undefined || !Number.isFinite(velocity) ? 1 : Math.max(0, Math.min(1, velocity));
  return Math.max(1, Math.round(value * 127));
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/**
 * Deterministic round-robin: each group cycles through its alternatives, starting at an
 * offset derived from the project seed. Playback and export each create one per pass and
 * request regions in the same order, so they pick the same samples.
 */
export class RoundRobin {
  private counters = new Map<string, number>();
  constructor(private readonly seed: number) {}

  next(group: string, size: number): number {
    if (size <= 1) return 0;
    const current = this.counters.get(group) ?? hash(`${this.seed}:${group}`) % size;
    this.counters.set(group, (current + 1) % size);
    return current % size;
  }
}

/**
 * Choose the sample region for a note. Priority: articulation, note range (or nearest root
 * within the pitch-shift limit), velocity layer (or nearest layer), round robin.
 * Returns undefined when nothing can play the note within the instrument's limits.
 */
export function selectRegion(manifest: InstrumentManifest, request: RegionRequest, roundRobin?: RoundRobin): RegionChoice | undefined {
  const midi = playableMidi(manifest, request.midi);
  return midi === undefined ? undefined : selectExact(manifest, { ...request, midi }, roundRobin);
}

const reachable = (manifest: InstrumentManifest, midi: number) => manifest.regions.some((region) =>
  (region.lowMidi <= midi && midi <= region.highMidi && Math.abs(region.rootMidi - midi) <= manifest.pitchShiftLimitSemitones)
  || Math.abs(region.rootMidi - midi) <= manifest.pitchShiftLimitSemitones);

/**
 * The note an instrument actually plays for `midi`. Pitched instruments play notes outside their range an
 * octave (or more) in, rather than not at all, so a hummed melody can be heard on a bass and a bass line on
 * strings. Drums never fold. Undefined when nothing can play it.
 */
export function playableMidi(manifest: InstrumentManifest, midi: number): number | undefined {
  if (reachable(manifest, midi)) return midi;
  if (manifest.family === 'drums' || manifest.family === 'percussion' || !manifest.regions.length) return undefined;
  const low = Math.min(...manifest.regions.map((region) => region.lowMidi));
  const high = Math.max(...manifest.regions.map((region) => region.highMidi));
  const direction = midi > high ? -12 : midi < low ? 12 : 0;
  if (!direction) return undefined;
  for (let octaves = 1; octaves <= 6; octaves++) {
    if (reachable(manifest, midi + direction * octaves)) return midi + direction * octaves;
  }
  return undefined;
}

function selectExact(manifest: InstrumentManifest, request: RegionRequest, roundRobin?: RoundRobin): RegionChoice | undefined {
  const { midi, velocity } = request;
  const articulation = request.articulation && manifest.regions.some((region) => region.articulation === request.articulation)
    ? request.articulation
    : manifest.defaultArticulation;
  const candidates = manifest.regions.filter((region) => region.articulation === articulation);

  let byNote = candidates.filter((region) => region.lowMidi <= midi && midi <= region.highMidi);
  if (!byNote.length) {
    const reachable = candidates.filter((region) => Math.abs(region.rootMidi - midi) <= manifest.pitchShiftLimitSemitones);
    if (!reachable.length) return undefined;
    const nearest = Math.min(...reachable.map((region) => Math.abs(region.rootMidi - midi)));
    byNote = reachable.filter((region) => Math.abs(region.rootMidi - midi) === nearest);
  }

  const velocityDistance = (region: SampleRegion) =>
    velocity < region.velocityLow ? region.velocityLow - velocity : velocity > region.velocityHigh ? velocity - region.velocityHigh : 0;
  const bestVelocity = Math.min(...byNote.map(velocityDistance));
  const byVelocity = byNote.filter((region) => velocityDistance(region) === bestVelocity);

  const bestRoot = Math.min(...byVelocity.map((region) => Math.abs(region.rootMidi - midi)));
  const alternatives = byVelocity
    .filter((region) => Math.abs(region.rootMidi - midi) === bestRoot)
    .sort((a, b) => (a.roundRobinIndex ?? 0) - (b.roundRobinIndex ?? 0) || a.id.localeCompare(b.id));

  const group = alternatives[0].roundRobinGroup ?? alternatives.map((region) => region.id).join('|');
  const region = alternatives[roundRobin ? roundRobin.next(`${manifest.id}:${group}`, alternatives.length) : 0];
  if (Math.abs(region.rootMidi - midi) > manifest.pitchShiftLimitSemitones) return undefined;
  return {
    region,
    rate: 2 ** ((midi - region.rootMidi) / 12 + (region.tuneCents ?? 0) / 1200),
    gain: dbToGain((manifest.gainDb ?? 0) + (region.gainDb ?? 0)),
  };
}
