import { stepDuration, stepDurationWithSwing } from '../audio/scheduler';
import { arrangementLength, totalSteps, type Project } from './project';

/**
 * Song › Tempo: the tempo changes at the start of a bar, at once or gliding over a few bars.
 * Without changes every function here gives exactly the arithmetic the app used before, so
 * existing projects play and export identically.
 */
export interface TempoChange {
  /** Bar index on the song timeline (0-based; the first change is at bar index 1 or later). */
  bar: number;
  bpm: number;
  /** Bars over which the tempo glides from the previous tempo to `bpm` (0 = at once). */
  glideBars?: number;
}

export const MIN_BPM = 40;
export const MAX_BPM = 200;
export const GLIDE_BARS = [0, 1, 2, 4] as const;

type Timing = Pick<Project, 'bpm' | 'noteLength' | 'loopBars' | 'arrangement' | 'swingTemplate' | 'tempoChanges'>;

/** Steps in one pass of the song (the arrangement, or the loop when there is none). */
export const songSteps = (p: Pick<Project, 'noteLength' | 'loopBars' | 'arrangement'>) => arrangementLength(p as Project) || totalSteps(p);
export const songBars = (p: Pick<Project, 'noteLength' | 'loopBars' | 'arrangement'>) => Math.max(1, Math.ceil(songSteps(p) / p.noteLength));

/** The changes that can play: inside the song, sorted, one per bar. */
export function tempoChanges(p: Timing): TempoChange[] {
  const bars = songBars(p);
  const byBar = new Map<number, TempoChange>();
  for (const change of p.tempoChanges ?? []) {
    if (Number.isInteger(change.bar) && change.bar >= 1 && change.bar < bars && Number.isFinite(change.bpm)) byBar.set(change.bar, change);
  }
  return [...byBar.values()].sort((a, b) => a.bar - b.bar);
}

export const hasTempoMap = (p: Timing) => tempoChanges(p).length > 0;

/** Tempo during song step `step` (wrapped into the song). */
export function bpmAtStep(p: Timing, step: number): number {
  const changes = tempoChanges(p);
  if (!changes.length) return p.bpm;
  const total = songSteps(p);
  const s = ((Math.floor(step) % total) + total) % total;
  let tempo = p.bpm;
  for (const change of changes) {
    const start = change.bar * p.noteLength;
    if (s < start) break;
    const glide = Math.max(0, change.glideBars ?? 0) * p.noteLength;
    if (glide > 0 && s < start + glide) return tempo + (change.bpm - tempo) * ((s - start + 1) / glide);
    tempo = change.bpm;
  }
  return tempo;
}

/** Seconds from the start of step `step` to the next one, with swing. */
export function stepSeconds(p: Timing, step: number): number {
  if (!hasTempoMap(p)) return stepDurationWithSwing(p.bpm, p.noteLength, p.swingTemplate, step);
  return stepDurationWithSwing(bpmAtStep(p, step), p.noteLength, p.swingTemplate, step);
}

/** Seconds that `steps` steps last from song step `from` (no swing, like note lengths). */
export function durationAt(p: Timing, from: number, steps: number): number {
  if (!hasTempoMap(p)) return steps * stepDuration(p.bpm, p.noteLength);
  let seconds = 0;
  let left = Math.max(0, steps);
  let step = Math.floor(from);
  while (left > 0) {
    const part = Math.min(1, left);
    seconds += part * stepDuration(bpmAtStep(p, step), p.noteLength);
    left -= part;
    step++;
  }
  return seconds;
}

/** Seconds from the start of the song to the start of `step`. */
export function stepStartSeconds(p: Timing, step: number): number {
  if (!hasTempoMap(p)) return step * stepDuration(p.bpm, p.noteLength);
  let seconds = 0;
  for (let s = 0; s < step; s++) seconds += stepSeconds(p, s);
  return seconds;
}

/** Length of one pass of the song in seconds. */
export const songSeconds = (p: Timing) => stepStartSeconds(p, songSteps(p));

/** Song step (fractional) playing `seconds` into a pass of the song. */
export function stepAtSeconds(p: Timing, seconds: number): number {
  if (!hasTempoMap(p)) return seconds / stepDuration(p.bpm, p.noteLength);
  const total = songSteps(p);
  let elapsed = 0;
  for (let s = 0; s < total; s++) {
    const length = stepSeconds(p, s);
    if (seconds < elapsed + length) return s + (seconds - elapsed) / length;
    elapsed += length;
  }
  return total;
}

const clampBpm = (bpm: number) => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));

/** Set (or replace) the change at `bar`. */
export function setTempoChange(p: Project, bar: number, bpm: number, glideBars = 0): Project {
  if (!Number.isInteger(bar) || bar < 1 || bar >= songBars(p) || !Number.isFinite(bpm)) return p;
  const glide = (GLIDE_BARS as readonly number[]).includes(glideBars) ? glideBars : 0;
  const others = (p.tempoChanges ?? []).filter((change) => change.bar !== bar);
  const change: TempoChange = { bar, bpm: clampBpm(bpm), ...(glide ? { glideBars: glide } : {}) };
  return { ...p, tempoChanges: [...others, change].sort((a, b) => a.bar - b.bar) };
}

/** Move a change to another bar, keeping its tempo and glide. */
export function moveTempoChange(p: Project, from: number, to: number): Project {
  const change = p.tempoChanges?.find((item) => item.bar === from);
  if (!change || from === to) return p;
  return setTempoChange(removeTempoChange(p, from), to, change.bpm, change.glideBars ?? 0);
}

export function removeTempoChange(p: Project, bar: number): Project {
  const rest = (p.tempoChanges ?? []).filter((change) => change.bar !== bar);
  if (rest.length === (p.tempoChanges ?? []).length) return p;
  const { tempoChanges: _all, ...without } = p;
  return rest.length ? { ...without, tempoChanges: rest } : without;
}

/** First bar after the last change (or bar 2), for Add. */
export function nextFreeTempoBar(p: Project): number | undefined {
  const used = new Set((p.tempoChanges ?? []).map((change) => change.bar));
  const last = Math.max(0, ...used);
  for (let bar = last + 1; bar < songBars(p); bar++) if (!used.has(bar)) return bar;
  for (let bar = 1; bar < songBars(p); bar++) if (!used.has(bar)) return bar;
  return undefined;
}

export function normalizeTempoChanges(value: unknown): TempoChange[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const changes = value.flatMap((item): TempoChange[] => {
    if (!item || typeof item !== 'object') return [];
    const { bar, bpm, glideBars } = item as Partial<TempoChange>;
    if (!Number.isInteger(bar) || bar! < 1 || !Number.isFinite(bpm)) return [];
    const glide = (GLIDE_BARS as readonly number[]).includes(glideBars ?? 0) ? glideBars ?? 0 : 0;
    return [{ bar: bar!, bpm: clampBpm(bpm!), ...(glide ? { glideBars: glide } : {}) }];
  });
  return changes.length ? changes.sort((a, b) => a.bar - b.bar) : undefined;
}
