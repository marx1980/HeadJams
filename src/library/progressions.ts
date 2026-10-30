import { chordPitches, type ChordQuality } from '../model/music';
import type { NoteEvent } from '../model/project';

/** Chords by ear (hum.md H3): key detection and whole-progression alternatives for a melody. */

export interface DetectedKey {
  /** Pitch class of the tonic (0 = C). */
  root: number;
  scaleId: 'major' | 'minor';
  /** 0–1: how clearly the melody points to this key over the next best. */
  confidence: number;
}

// Krumhansl–Kessler key profiles.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const pc = (pitch: number) => ((Math.round(pitch) % 12) + 12) % 12;

function correlation(a: readonly number[], b: readonly number[]): number {
  const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

const noteWeight = (note: NoteEvent, stepsPerBeat: number) => {
  const confidence = Number.isFinite(note.confidence) ? Math.max(0, Math.min(1, note.confidence!)) : 0.8;
  const onBeat = note.step % stepsPerBeat === 0 ? 1.5 : 1;
  return Math.max(0.25, Math.min(8, note.durationSteps)) * (0.5 + confidence * 0.5) * onBeat;
};

/** The melody's key from its pitch-class weights; the first and last notes count a little extra. */
export function detectKey(notes: readonly NoteEvent[], stepsPerBar = 16): DetectedKey | undefined {
  const valid = notes.filter((note) => Number.isFinite(note.pitch) && Number.isFinite(note.step) && note.durationSteps > 0);
  if (!valid.length) return undefined;
  const stepsPerBeat = Math.max(1, Math.round(stepsPerBar / 4));
  const weights = new Array(12).fill(0);
  for (const note of valid) weights[pc(note.pitch)] += noteWeight(note, stepsPerBeat);
  const ordered = [...valid].sort((a, b) => a.step - b.step);
  weights[pc(ordered.at(-1)!.pitch)] += 1.5;
  weights[pc(ordered[0].pitch)] += 0.5;
  const ranked: { key: DetectedKey; score: number }[] = [];
  for (let root = 0; root < 12; root++) {
    for (const [scaleId, profile] of [['major', MAJOR_PROFILE], ['minor', MINOR_PROFILE]] as const) {
      const rotated = Array.from({ length: 12 }, (_, i) => profile[(i - root + 12) % 12]);
      ranked.push({ key: { root, scaleId, confidence: 0 }, score: correlation(weights, rotated) });
    }
  }
  ranked.sort((a, b) => b.score - a.score || a.key.root - b.key.root);
  const [best, second] = ranked;
  // Relative major/minor share notes; prefer the one whose tonic the melody actually sits on.
  const relative = ranked.find((item) => item.key.scaleId !== best.key.scaleId
    && item.key.root === (best.key.scaleId === 'major' ? (best.key.root + 9) % 12 : (best.key.root + 3) % 12));
  let chosen = best;
  if (relative && best.score - relative.score < 0.08 && weights[relative.key.root] > weights[best.key.root] * 1.25) chosen = relative;
  const runnerUp = chosen === best ? second : best;
  const margin = Math.max(0, chosen.score - runnerUp.score);
  const confidence = Math.max(0, Math.min(1, chosen.score * 0.6 + margin * 4));
  return { ...chosen.key, confidence: Math.round(confidence * 100) / 100 };
}

export interface ProgressionChord {
  step: number;
  durationSteps: number;
  /** MIDI root in the octave from C3 (48–59). */
  root: number;
  quality: ChordQuality;
}

export type ProgressionStyle = 'simple' | 'different' | 'colour';

export interface Progression {
  id: ProgressionStyle;
  label: string;
  chords: ProgressionChord[];
  /** 0–1 share of strong-beat melody notes that are chord tones. */
  fit: number;
}

export const PROGRESSION_STYLES: ReadonlyArray<{ id: ProgressionStyle; label: string }> = [
  { id: 'simple', label: 'Simple' },
  { id: 'different', label: 'Different' },
  { id: 'colour', label: 'Colour' },
];

interface Candidate {
  /** Semitones above the tonic. */
  degree: number;
  quality: ChordQuality;
  /** Base preference (lower is more common). */
  cost: number;
  /** Harmonic function, for cadence scoring. */
  role: 'tonic' | 'subdominant' | 'dominant' | 'other';
}

const MAJOR_TRIADS: Candidate[] = [
  { degree: 0, quality: 'major', cost: 0, role: 'tonic' },
  { degree: 5, quality: 'major', cost: 0.1, role: 'subdominant' },
  { degree: 7, quality: 'major', cost: 0.1, role: 'dominant' },
  { degree: 9, quality: 'minor', cost: 0.2, role: 'tonic' },
  { degree: 2, quality: 'minor', cost: 0.45, role: 'subdominant' },
  { degree: 4, quality: 'minor', cost: 0.6, role: 'other' },
];
const MINOR_TRIADS: Candidate[] = [
  { degree: 0, quality: 'minor', cost: 0, role: 'tonic' },
  { degree: 5, quality: 'minor', cost: 0.1, role: 'subdominant' },
  { degree: 7, quality: 'major', cost: 0.15, role: 'dominant' },
  { degree: 8, quality: 'major', cost: 0.15, role: 'subdominant' },
  { degree: 3, quality: 'major', cost: 0.25, role: 'tonic' },
  { degree: 10, quality: 'major', cost: 0.25, role: 'dominant' },
  { degree: 7, quality: 'minor', cost: 0.45, role: 'dominant' },
];
/** Extra chords for "Different": borrowed and less common diatonic chords. */
const MAJOR_EXTRA: Candidate[] = [
  { degree: 10, quality: 'major', cost: 0.5, role: 'subdominant' },
  { degree: 5, quality: 'minor', cost: 0.55, role: 'subdominant' },
  { degree: 8, quality: 'major', cost: 0.65, role: 'subdominant' },
  { degree: 2, quality: 'major', cost: 0.7, role: 'dominant' },
];
const MINOR_EXTRA: Candidate[] = [
  { degree: 2, quality: 'diminished', cost: 0.6, role: 'subdominant' },
  { degree: 5, quality: 'major', cost: 0.45, role: 'subdominant' },
  { degree: 0, quality: 'sus4', cost: 0.5, role: 'tonic' },
];
/** Colour versions of triads (sevenths and suspensions). */
function colourOf(candidate: Candidate, scaleId: 'major' | 'minor'): Candidate[] {
  const out: Candidate[] = [];
  const { degree, quality } = candidate;
  if (quality === 'major') {
    const dominant = candidate.role === 'dominant' && (degree === 7 || degree === 2 || degree === 10);
    out.push({ ...candidate, quality: dominant ? 'seventh' : 'major7', cost: candidate.cost + 0.05 });
    out.push({ ...candidate, quality: 'sus2', cost: candidate.cost + 0.2 });
    if (dominant) out.push({ ...candidate, quality: 'sus4', cost: candidate.cost + 0.15 });
  } else if (quality === 'minor') {
    out.push({ ...candidate, quality: 'minor7', cost: candidate.cost + 0.05 });
    if (scaleId === 'minor' && degree === 0) out.push({ ...candidate, quality: 'sus2', cost: candidate.cost + 0.2 });
  }
  return out;
}

const tones = (keyRoot: number, candidate: Candidate) =>
  new Set(chordPitches(48 + ((keyRoot + candidate.degree) % 12), candidate.quality).map(pc));

interface Slot {
  step: number;
  durationSteps: number;
  notes: NoteEvent[];
}

function slotsFor(notes: readonly NoteEvent[], stepsPerBar: number, bars: number, halfBar: boolean): Slot[] {
  const size = halfBar ? Math.max(1, Math.floor(stepsPerBar / 2)) : stepsPerBar;
  const count = Math.ceil((bars * stepsPerBar) / size);
  return Array.from({ length: count }, (_, index) => {
    const step = index * size;
    // A note sounding into the slot counts too (held notes carry over bar lines).
    const inSlot = notes.filter((note) => note.step < step + size && note.step + note.durationSteps > step);
    return { step, durationSteps: Math.min(size, bars * stepsPerBar - step), notes: inSlot };
  });
}

function melodyCost(slot: Slot, chord: Set<number>, scale: Set<number>, stepsPerBeat: number): { cost: number; strong: number; strongHit: number } {
  let cost = 0;
  let strong = 0;
  let strongHit = 0;
  for (const note of slot.notes) {
    const start = Math.max(note.step, slot.step);
    const end = Math.min(note.step + note.durationSteps, slot.step + slot.durationSteps);
    const length = Math.max(0.25, end - start);
    const onStrongBeat = start === slot.step || (start - slot.step) % (stepsPerBeat * 2) === 0;
    const weight = length * (onStrongBeat ? 2 : 1) * (note.step < slot.step ? 0.5 : 1);
    const pitchClass = pc(note.pitch);
    if (chord.has(pitchClass)) {
      if (onStrongBeat) strongHit += weight;
    } else {
      cost += weight * (scale.has(pitchClass) ? 0.6 : 1.2);
    }
    if (onStrongBeat) strong += weight;
  }
  return { cost, strong, strongHit };
}

function transitionCost(previous: Candidate | undefined, next: Candidate, repeatRun: number, keyRoot: number): number {
  if (!previous) return next.role === 'tonic' && next.degree === 0 ? -0.3 : 0;
  let cost = 0;
  if (previous.degree === next.degree && previous.quality === next.quality) cost += repeatRun >= 2 ? 0.9 : 0.25;
  const common = [...tones(keyRoot, previous)].filter((tone) => tones(keyRoot, next).has(tone)).length;
  cost -= common * 0.06;
  if (previous.role === 'dominant' && next.degree === 0) cost -= 0.35; // V → I
  if (previous.role === 'subdominant' && next.role === 'dominant') cost -= 0.2; // IV/ii → V
  if (previous.role === 'dominant' && next.role === 'subdominant') cost += 0.15; // V → IV (retrograde)
  return cost;
}

interface SearchOptions {
  candidates: Candidate[];
  /** Chords to steer away from, per slot (for "Different"). */
  avoid?: (Candidate | undefined)[];
  avoidCost?: number;
  tonicStart: number;
  endCadence: number;
}

/** Viterbi search over slots: melody fit + common-chord preference + smooth, varied movement. */
function search(slots: Slot[], keyRoot: number, scale: Set<number>, stepsPerBeat: number, options: SearchOptions): (Candidate | undefined)[] {
  const { candidates } = options;
  const active = slots.map((slot) => slot.notes.length > 0);
  type Cell = { cost: number; back: number; run: number };
  const table: Cell[][] = [];
  const chordTones = candidates.map((candidate) => tones(keyRoot, candidate));
  slots.forEach((slot, index) => {
    const row: Cell[] = candidates.map((candidate, c) => {
      const melody = melodyCost(slot, chordTones[c], scale, stepsPerBeat);
      let local = melody.cost + candidate.cost;
      if (options.avoid?.[index] && options.avoid[index]!.degree === candidate.degree) local += options.avoidCost ?? 0;
      if (index === 0 && candidate.degree === 0 && candidate.role === 'tonic') local -= options.tonicStart;
      if (index === slots.length - 1) {
        if (candidate.degree === 0 && candidate.role === 'tonic') local -= options.endCadence;
        else if (candidate.role === 'dominant' && candidate.degree === 7) local -= options.endCadence * 0.5;
      }
      if (!active[index]) local = candidate.cost * 0.5;
      if (index === 0) return { cost: local + transitionCost(undefined, candidate, 0, keyRoot), back: -1, run: 1 };
      let best: Cell = { cost: Number.POSITIVE_INFINITY, back: 0, run: 1 };
      table[index - 1].forEach((previous, p) => {
        const same = candidates[p].degree === candidate.degree && candidates[p].quality === candidate.quality;
        const run = same ? previous.run + 1 : 1;
        const total = previous.cost + local + transitionCost(candidates[p], candidate, previous.run, keyRoot);
        if (total < best.cost - 1e-9) best = { cost: total, back: p, run };
      });
      return best;
    });
    table.push(row);
  });
  let index = table.at(-1)!.reduce((best, cell, c, row) => (cell.cost < row[best].cost - 1e-9 ? c : best), 0);
  const path: Candidate[] = [];
  for (let slot = table.length - 1; slot >= 0; slot--) {
    path.unshift(candidates[index]);
    index = table[slot][index].back;
  }
  return path;
}

function fitOf(slots: Slot[], path: (Candidate | undefined)[], keyRoot: number, scale: Set<number>, stepsPerBeat: number): number {
  let strong = 0;
  let hit = 0;
  slots.forEach((slot, index) => {
    const candidate = path[index];
    if (!candidate) return;
    const result = melodyCost(slot, tones(keyRoot, candidate), scale, stepsPerBeat);
    strong += result.strong;
    hit += result.strongHit;
  });
  return strong ? Math.round((hit / strong) * 100) / 100 : 0;
}

/** Merge consecutive slots that hold the same chord into one longer chord. */
function toChords(slots: Slot[], path: (Candidate | undefined)[], keyRoot: number): ProgressionChord[] {
  const chords: ProgressionChord[] = [];
  slots.forEach((slot, index) => {
    const candidate = path[index];
    if (!candidate) return;
    const root = 48 + ((keyRoot + candidate.degree) % 12);
    const last = chords.at(-1);
    if (last && last.root === root && last.quality === candidate.quality && last.step + last.durationSteps === slot.step) {
      last.durationSteps += slot.durationSteps;
    } else {
      chords.push({ step: slot.step, durationSteps: slot.durationSteps, root, quality: candidate.quality });
    }
  });
  return chords;
}

/**
 * Three whole-progression alternatives for a melody: Simple (common chords, home at both ends),
 * Different (other chords where the melody allows), Colour (sevenths and suspensions on the Simple shape).
 */
export function suggestProgressions(
  notes: readonly NoteEvent[], key: Pick<DetectedKey, 'root' | 'scaleId'>, stepsPerBar: number, bars: number,
  options: { halfBar?: boolean } = {},
): Progression[] {
  const valid = notes.filter((note) => Number.isFinite(note.pitch) && Number.isFinite(note.step) && note.step >= 0
    && Number.isFinite(note.durationSteps) && note.durationSteps > 0);
  if (!valid.length || !Number.isInteger(stepsPerBar) || stepsPerBar < 1 || !Number.isInteger(bars) || bars < 1) return [];
  const keyRoot = pc(key.root);
  const minor = key.scaleId === 'minor';
  const scale = new Set((minor ? [0, 2, 3, 5, 7, 8, 10, 11] : [0, 2, 4, 5, 7, 9, 11]).map((interval) => (keyRoot + interval) % 12));
  const stepsPerBeat = Math.max(1, Math.round(stepsPerBar / 4));
  const slots = slotsFor(valid, stepsPerBar, bars, Boolean(options.halfBar));
  const triads = minor ? MINOR_TRIADS : MAJOR_TRIADS;

  const simple = search(slots, keyRoot, scale, stepsPerBeat, {
    candidates: triads.slice(0, minor ? 6 : 4), tonicStart: 1.2, endCadence: 0.6,
  });
  const differentPool = [...triads, ...(minor ? MINOR_EXTRA : MAJOR_EXTRA)];
  let different = search(slots, keyRoot, scale, stepsPerBeat, {
    candidates: differentPool, avoid: simple, avoidCost: 0.7, tonicStart: 0.2, endCadence: 0.3,
  });
  if (different.every((candidate, index) => candidate?.degree === simple[index]?.degree)) {
    different = search(slots, keyRoot, scale, stepsPerBeat, {
      candidates: differentPool, avoid: simple, avoidCost: 2, tonicStart: 0, endCadence: 0.2,
    });
  }
  // Colour keeps the Simple progression's roots and picks the richest quality the melody allows on each.
  const colour = simple.map((candidate, index) => {
    if (!candidate) return candidate;
    const options = [candidate, ...colourOf(candidate, key.scaleId)];
    const slot = slots[index];
    let best = candidate;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const option of options) {
      const melody = melodyCost(slot, tones(keyRoot, option), scale, stepsPerBeat);
      const richness = option.quality === candidate.quality ? 0.35 : 0;
      const cost = melody.cost + richness + (option.cost - candidate.cost);
      if (cost < bestCost - 1e-9) { bestCost = cost; best = option; }
    }
    return best;
  });

  return [
    { id: 'simple' as const, path: simple },
    { id: 'different' as const, path: different },
    { id: 'colour' as const, path: colour },
  ].map(({ id, path }) => ({
    id,
    label: PROGRESSION_STYLES.find((style) => style.id === id)!.label,
    chords: toChords(slots, path, keyRoot),
    fit: fitOf(slots, path, keyRoot, scale, stepsPerBeat),
  }));
}
