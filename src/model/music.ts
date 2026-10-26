export type Pitch = number;
export type ChordQuality = 'major' | 'minor' | 'diminished' | 'sus2' | 'sus4';

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
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
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

export function pitchToFrequency(pitch: Pitch): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}
