export type Pitch = number;
export type ChordQuality = 'major' | 'minor' | 'diminished' | 'augmented' | 'sus2' | 'sus4' | 'seventh' | 'major7' | 'minor7';
export type ChordArticulation = 'sustained' | 'down-strum' | 'up-strum' | 'muted' | 'power';

export const CHORD_QUALITIES: ReadonlyArray<{ id: ChordQuality; label: string }> = [
  { id: 'major', label: 'Major' },
  { id: 'minor', label: 'Minor' },
  { id: 'diminished', label: 'Diminished' },
  { id: 'augmented', label: 'Augmented' },
  { id: 'sus2', label: 'Suspended 2' },
  { id: 'sus4', label: 'Suspended 4' },
  { id: 'seventh', label: 'Dominant 7th' },
  { id: 'major7', label: 'Major 7th' },
  { id: 'minor7', label: 'Minor 7th' },
];

export const CHORD_ARTICULATIONS: ReadonlyArray<{ id: ChordArticulation; label: string }> = [
  { id: 'sustained', label: 'Sustained' },
  { id: 'down-strum', label: 'Down strum' },
  { id: 'up-strum', label: 'Up strum' },
  { id: 'muted', label: 'Muted' },
  { id: 'power', label: 'Power chord' },
];

export interface Scale {
  id: string;
  name: string;
  intervals: readonly number[];
}

export const SCALES: readonly Scale[] = [
  { id: 'major', name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor', name: 'Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'major-pentatonic', name: 'Major pentatonic', intervals: [0, 2, 4, 7, 9] },
  { id: 'minor-pentatonic', name: 'Minor pentatonic', intervals: [0, 3, 5, 7, 10] },
];

const CHORD_INTERVALS: Record<ChordQuality, readonly number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  seventh: [0, 4, 7, 10],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
};

export function isPitchInScale(pitch: Pitch, root: number, scale: Scale): boolean {
  const pitchClass = ((pitch - root) % 12 + 12) % 12;
  return scale.intervals.includes(pitchClass);
}

export function snapPitchToScale(pitch: Pitch, root: number, scale: Scale): Pitch {
  if (isPitchInScale(pitch, root, scale)) return pitch;
  for (let distance = 1; distance < 12; distance++) {
    const lower = pitch - distance;
    if (isPitchInScale(lower, root, scale)) return lower;
    const upper = pitch + distance;
    if (isPitchInScale(upper, root, scale)) return upper;
  }
  return pitch;
}

export function scalePitches(root: number, scale: Scale, octaves = 1): Pitch[] {
  const count = Math.max(0, Math.floor(octaves));
  const start = Math.floor(root / 12) * 12;
  const end = start + count * 12;
  return Array.from({ length: end - start }, (_, i) => start + i)
    .filter((pitch) => isPitchInScale(pitch, root, scale));
}

export function chordPitches(root: Pitch, quality: ChordQuality): Pitch[] {
  return CHORD_INTERVALS[quality].map((interval) => root + interval);
}

const GUITAR_OPEN_STRINGS = [40, 45, 50, 55, 59, 64];
const GUITAR_MAX_FRET = 12;

/** Resolve a chord to a playable six-string guitar voicing in the instrument's register. */
export function guitarChordPitches(
  root: Pitch,
  quality: ChordQuality,
  articulation: ChordArticulation = 'sustained',
): Pitch[] {
  if (!Number.isFinite(root) || !CHORD_INTERVALS[quality]) return [];
  const intervals = articulation === 'power' ? [0, 7, 12] : CHORD_INTERVALS[quality];
  const targetRoot = Math.round(root);
  const assignments: Array<{ pitch: number; string: number; fret: number }>[][] = intervals.map((interval) => {
    const target = targetRoot + interval;
    return GUITAR_OPEN_STRINGS.flatMap((openPitch, string) =>
      Array.from({ length: GUITAR_MAX_FRET + 1 }, (_, fret) => ({
        pitch: openPitch + fret,
        string,
        fret,
      })).filter((candidate) =>
        candidate.pitch >= 40 && candidate.pitch <= 76
        && ((candidate.pitch - target) % 12 + 12) % 12 === 0,
      ),
    );
  });
  let best: Array<{ pitch: number; string: number; fret: number }> | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  const search = (
    index: number,
    chosen: Array<{ pitch: number; string: number; fret: number }>,
    usedStrings: Set<number>,
    usedPitches: Set<number>,
    score: number,
  ) => {
    if (index === assignments.length) {
      if (score < bestScore) {
        best = [...chosen];
        bestScore = score;
      }
      return;
    }
    const target = targetRoot + intervals[index];
    for (const candidate of assignments[index]) {
      if (usedStrings.has(candidate.string) || usedPitches.has(candidate.pitch)) continue;
      const nextScore = score + Math.abs(candidate.pitch - target) + candidate.fret * 0.12;
      if (nextScore >= bestScore) continue;
      chosen.push(candidate);
      usedStrings.add(candidate.string);
      usedPitches.add(candidate.pitch);
      search(index + 1, chosen, usedStrings, usedPitches, nextScore);
      chosen.pop();
      usedStrings.delete(candidate.string);
      usedPitches.delete(candidate.pitch);
    }
  };
  search(0, [], new Set(), new Set(), 0);
  return best?.map(({ pitch }) => pitch).sort((a, b) => a - b) ?? [];
}

const CHORD_SUFFIXES: Record<ChordQuality, string> = {
  major: '',
  minor: 'm',
  diminished: 'dim',
  augmented: 'aug',
  sus2: 'sus2',
  sus4: 'sus4',
  seventh: '7',
  major7: 'maj7',
  minor7: 'm7',
};

const PITCH_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function formatChordSymbol(root: Pitch, quality: ChordQuality, articulation: ChordArticulation = 'sustained'): string {
  const pitchClass = ((Math.round(root) % 12) + 12) % 12;
  return `${PITCH_NAMES[pitchClass]}${articulation === 'power' ? '5' : CHORD_SUFFIXES[quality]}`;
}

export function pitchToFrequency(pitch: Pitch): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}
