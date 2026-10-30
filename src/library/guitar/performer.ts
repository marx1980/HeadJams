import type { ChordEvent } from '../../model/project';
import { guitarChordPitches } from '../../model/music';
import { chooseVoicing, STANDARD_TUNING, type GuitarVoicing } from './voicings';
import { hashSeed, seededRandom, strumOffsets } from './strum';

/** One string of a performed chord. */
export interface GuitarStroke {
  string: number;
  pitch: number;
  offsetSec: number;
  velocity: number;
}

/**
 * Each string of a chord is played at this level, so a six-string strum sits near a single note's
 * loudness instead of six notes stacked (velocity still picks the sample layer).
 */
export const CHORD_STRING_LEVEL = 0.6;

/** Strum length (seconds, first to last string) and velocity scale per articulation. */
const STRUM: Record<ChordEvent['articulation'], { sec: number; velocity: number }> = {
  sustained: { sec: 0.012, velocity: 1 },
  'down-strum': { sec: 0.045, velocity: 1 },
  'up-strum': { sec: 0.032, velocity: 0.85 },
  muted: { sec: 0.02, velocity: 1 },
  power: { sec: 0.016, velocity: 1 },
};
const HUMANISE = 0.5;
const VELOCITY_JITTER = 0.06;

/** Fallback for chords outside the dictionary: the generic solver's notes, one per string. */
function solverVoicing(event: ChordEvent): GuitarVoicing {
  const pitches = guitarChordPitches(event.root, event.quality, event.articulation).sort((a, b) => a - b);
  const notes = pitches.slice(0, 6).map((midi, index) => {
    let string = 5;
    for (let s = 0; s < 6; s++) if (STANDARD_TUNING[s] <= midi) string = s;
    return { string: Math.max(index, Math.min(string, 5 - (pitches.length - 1 - index))), fret: 0, midi };
  });
  const frets: (number | null)[] = Array(6).fill(null);
  for (const note of notes) {
    note.fret = note.midi - STANDARD_TUNING[note.string];
    frets[note.string] = note.fret;
  }
  return { frets, notes, open: false, barre: false };
}

/** Voicings for a channel's chord events in time order, each chosen to sit close to the one before. */
export function voiceChordSequence(events: readonly ChordEvent[]): Map<string, GuitarVoicing> {
  const voicings = new Map<string, GuitarVoicing>();
  let previous: GuitarVoicing | undefined;
  const sorted = [...events].sort((a, b) => a.step - b.step || a.id.localeCompare(b.id));
  for (const event of sorted) {
    const quality = event.articulation === 'power' ? 'power' : event.quality;
    const voicing = chooseVoicing(event.root, quality, previous) ?? solverVoicing(event);
    voicings.set(event.id, voicing);
    previous = voicing;
  }
  return voicings;
}

/**
 * Turn a chord event into string-by-string strokes: down-strums run low to high, up-strums high to low,
 * with seeded humanised timing and velocity (the same seed always gives the same performance).
 */
export function performChord(event: ChordEvent, voicing: GuitarVoicing, seed: string): GuitarStroke[] {
  const style = STRUM[event.articulation] ?? STRUM.sustained;
  const strings = [...voicing.notes].sort((a, b) => a.string - b.string);
  if (event.articulation === 'up-strum') strings.reverse();
  const random = seededRandom(hashSeed(seed));
  const offsets = strumOffsets(strings.length, style.sec, HUMANISE, random);
  const base = Math.max(0, Math.min(1, event.velocity ?? 1)) * style.velocity;
  return strings.map((note, index) => {
    const jitter = 1 + (random() * 2 - 1) * VELOCITY_JITTER;
    // Strings struck later in a strum are slightly softer.
    const fall = 1 - 0.04 * index / Math.max(1, strings.length - 1);
    return {
      string: note.string,
      pitch: note.midi,
      offsetSec: offsets[index],
      velocity: Math.max(0.05, Math.min(1, base * jitter * fall)),
    };
  });
}
