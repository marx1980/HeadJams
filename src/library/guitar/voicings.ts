import type { ChordQuality } from '../../model/music';

/** Standard tuning, string 0 = low E … string 5 = high E (MIDI). */
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64] as const;

/** Fret per string, low to high; null = not played. */
export type Frets = (number | null)[];

export interface GuitarVoicing {
  frets: Frets;
  /** Sounding strings low to high. */
  notes: { string: number; fret: number; midi: number }[];
  open: boolean;
  barre: boolean;
}

type ShapeQuality = ChordQuality | 'power';

/** Open chords: [root pitch class, quality, frets]. */
const OPEN_SHAPES: [number, ShapeQuality, Frets][] = [
  [0, 'major', [null, 3, 2, 0, 1, 0]], [9, 'major', [null, 0, 2, 2, 2, 0]], [7, 'major', [3, 2, 0, 0, 0, 3]],
  [4, 'major', [0, 2, 2, 1, 0, 0]], [2, 'major', [null, null, 0, 2, 3, 2]],
  [9, 'minor', [null, 0, 2, 2, 1, 0]], [4, 'minor', [0, 2, 2, 0, 0, 0]], [2, 'minor', [null, null, 0, 2, 3, 1]],
  [0, 'seventh', [null, 3, 2, 3, 1, 0]], [9, 'seventh', [null, 0, 2, 0, 2, 0]], [7, 'seventh', [3, 2, 0, 0, 0, 1]],
  [4, 'seventh', [0, 2, 0, 1, 0, 0]], [2, 'seventh', [null, null, 0, 2, 1, 2]], [11, 'seventh', [null, 2, 1, 2, 0, 2]],
  [0, 'major7', [null, 3, 2, 0, 0, 0]], [9, 'major7', [null, 0, 2, 1, 2, 0]], [7, 'major7', [3, 2, 0, 0, 0, 2]],
  [4, 'major7', [0, 2, 1, 1, 0, 0]], [2, 'major7', [null, null, 0, 2, 2, 2]], [5, 'major7', [null, null, 3, 2, 1, 0]],
  [9, 'minor7', [null, 0, 2, 0, 1, 0]], [4, 'minor7', [0, 2, 2, 0, 3, 0]], [2, 'minor7', [null, null, 0, 2, 1, 1]],
  [11, 'minor7', [null, 2, 0, 2, 0, 2]],
  [9, 'sus2', [null, 0, 2, 2, 0, 0]], [2, 'sus2', [null, null, 0, 2, 3, 0]],
  [4, 'sus4', [0, 2, 2, 2, 0, 0]], [9, 'sus4', [null, 0, 2, 2, 3, 0]], [2, 'sus4', [null, null, 0, 2, 3, 3]],
];

/** Movable barre shapes: [quality, root string, frets relative to the root fret]. */
const MOVABLE_SHAPES: [ShapeQuality, number, Frets][] = [
  ['major', 0, [0, 2, 2, 1, 0, 0]], ['minor', 0, [0, 2, 2, 0, 0, 0]], ['seventh', 0, [0, 2, 0, 1, 0, 0]],
  ['minor7', 0, [0, 2, 0, 0, 0, 0]], ['major7', 0, [0, null, 1, 1, 0, null]], ['sus4', 0, [0, 2, 2, 2, 0, 0]],
  ['major', 1, [null, 0, 2, 2, 2, 0]], ['minor', 1, [null, 0, 2, 2, 1, 0]], ['seventh', 1, [null, 0, 2, 0, 2, 0]],
  ['minor7', 1, [null, 0, 2, 0, 1, 0]], ['major7', 1, [null, 0, 2, 1, 2, 0]], ['sus2', 1, [null, 0, 2, 2, 0, 0]],
  ['sus4', 1, [null, 0, 2, 2, 3, 0]], ['diminished', 1, [null, 0, 1, 2, 1, null]], ['augmented', 1, [null, 0, 3, 2, 2, 1]],
  ['power', 0, [0, 2, 2, null, null, null]], ['power', 1, [null, 0, 2, 2, null, null]],
];

function toVoicing(frets: Frets, open: boolean, barre: boolean): GuitarVoicing {
  return {
    frets,
    open,
    barre,
    notes: frets.flatMap((fret, string) => fret === null ? [] : [{ string, fret, midi: STANDARD_TUNING[string] + fret }]),
  };
}

/** Every shape that plays `quality` on `rootPitchClass` (open shapes first, then barre shapes up to fret 12). */
export function candidateVoicings(rootPitchClass: number, quality: ShapeQuality): GuitarVoicing[] {
  const pc = ((Math.round(rootPitchClass) % 12) + 12) % 12;
  const out: GuitarVoicing[] = OPEN_SHAPES
    .filter(([root, q]) => root === pc && q === quality)
    .map(([, , frets]) => toVoicing(frets, true, false));
  for (const [q, rootString, relative] of MOVABLE_SHAPES) {
    if (q !== quality) continue;
    for (let fret = 1; fret <= 12; fret++) {
      if ((STANDARD_TUNING[rootString] + fret) % 12 !== pc) continue;
      out.push(toVoicing(relative.map((offset) => offset === null ? null : offset + fret), false, quality !== 'power'));
    }
  }
  return out;
}

const centre = (voicing: GuitarVoicing) => {
  const fretted = voicing.notes.filter((note) => note.fret > 0);
  return fretted.length ? fretted.reduce((sum, note) => sum + note.fret, 0) / fretted.length : 0;
};

/**
 * Choose a playable shape: prefer open chords and low positions, and keep the hand close to the previous chord.
 * Returns undefined for chords the dictionary does not cover (callers fall back to the generic solver).
 */
export function chooseVoicing(rootPitchClass: number, quality: ShapeQuality, previous?: GuitarVoicing, capo = 0): GuitarVoicing | undefined {
  const fret = Math.max(0, Math.min(9, Math.round(capo)));
  // With a capo the hand plays the shape of the chord `capo` semitones lower, everything sounding `capo` higher.
  const candidates = candidateVoicings(rootPitchClass - fret, quality).map((voicing) => fret ? {
    ...voicing,
    frets: voicing.frets.map((value) => value === null ? null : value + fret),
    notes: voicing.notes.map((note) => ({ ...note, fret: note.fret + fret, midi: note.midi + fret })),
  } : voicing);
  let best: GuitarVoicing | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    let score = (candidate.open ? 0 : 2) + (candidate.barre ? 1.5 : 0) + centre(candidate) * 0.15;
    if (previous) {
      score += Math.abs(centre(candidate) - centre(previous)) * 0.5;
      score += candidate.frets.filter((fret, string) => fret !== previous.frets[string]).length * 0.1;
    }
    if (score < bestScore) { bestScore = score; best = candidate; }
  }
  return best;
}
