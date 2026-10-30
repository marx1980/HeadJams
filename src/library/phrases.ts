import { SCALES } from '../model/music';
import type { NoteEvent } from '../model/project';
import { hashSeed, seededRandom } from './guitar/strum';

/** Harmony presets and next-phrase variations (hum.md H6). Both are deterministic. */

interface Key { root: number; scaleId: string }

const scaleOf = (key: Key) => (SCALES.find((item) => item.id === key.scaleId) ?? SCALES[0]).intervals;

/** Pitch → (scale degree, octave) in the key, snapping out-of-key notes to the nearest degree. */
function toDegree(pitch: number, key: Key): number {
  const intervals = scaleOf(key);
  const relative = Math.round(pitch) - key.root;
  const octave = Math.floor(relative / 12);
  const pc = ((relative % 12) + 12) % 12;
  let degree = intervals.indexOf(pc);
  if (degree < 0) {
    degree = intervals.reduce((best, interval, index) => Math.abs(interval - pc) < Math.abs(intervals[best] - pc) ? index : best, 0);
  }
  return octave * intervals.length + degree;
}

function fromDegree(degree: number, key: Key): number {
  const intervals = scaleOf(key);
  const octave = Math.floor(degree / intervals.length);
  const index = ((degree % intervals.length) + intervals.length) % intervals.length;
  return key.root + octave * 12 + intervals[index];
}

export type HarmonyPreset = 'subtle' | 'warm' | 'wide';

export const HARMONY_PRESETS: ReadonlyArray<{ id: HarmonyPreset; label: string }> = [
  { id: 'subtle', label: 'Subtle' },
  { id: 'warm', label: 'Warm' },
  { id: 'wide', label: 'Wide' },
];

/**
 * Harmony voices for a melody, by scale degree: Subtle is a quiet third above on held notes only;
 * Warm a third below every note; Wide a sixth below and a fifth above.
 */
export function harmonyFor(notes: readonly NoteEvent[], key: Key, preset: HarmonyPreset, stepCount: number): NoteEvent[] {
  const voices = preset === 'subtle' ? [2] : preset === 'warm' ? [-2] : [-5, 4];
  const velocity = preset === 'subtle' ? 0.5 : preset === 'warm' ? 0.6 : 0.55;
  return notes.flatMap((note, index) => {
    if (!Number.isFinite(note.pitch) || note.step < 0 || note.step >= stepCount || note.durationSteps <= 0) return [];
    if (preset === 'subtle' && note.durationSteps < 2) return [];
    const degree = toDegree(note.pitch, key);
    return voices.map((offset) => ({
      id: `harmony-${preset}-${index}-${offset}`,
      step: note.step,
      pitch: Math.max(0, Math.min(127, fromDegree(degree + offset, key))),
      durationSteps: Math.min(note.durationSteps, stepCount - note.step),
      velocity,
    }));
  });
}

export type PhraseVariation = 'echo' | 'answer' | 'twist';

export const PHRASE_VARIATIONS: ReadonlyArray<{ id: PhraseVariation; label: string }> = [
  { id: 'echo', label: 'Echo' },
  { id: 'answer', label: 'Answer' },
  { id: 'twist', label: 'Twist' },
];

/**
 * A next phrase that follows the selected one, keeping its rhythm so it sounds related:
 * Echo repeats it and lands home; Answer moves it up or down the scale and lands home; Twist mirrors the contour
 * around its first note and ornaments one held note. The same seed always gives the same phrase.
 */
export function nextPhrase(notes: readonly NoteEvent[], key: Key, variation: PhraseVariation, seed: number): NoteEvent[] {
  const sorted = [...notes].filter((note) => Number.isFinite(note.pitch) && note.durationSteps > 0)
    .sort((a, b) => a.step - b.step || a.pitch - b.pitch);
  if (!sorted.length) return [];
  const random = seededRandom(hashSeed(`${seed}:${variation}:${sorted.map((note) => `${note.step}.${note.pitch}`).join(',')}`));
  const degrees = sorted.map((note) => toDegree(note.pitch, key));
  const first = degrees[0];
  const length = scaleOf(key).length;
  let shaped: number[];
  if (variation === 'echo') shaped = [...degrees];
  else if (variation === 'answer') {
    const shift = [2, -2, 1, -1][Math.floor(random() * 4)];
    shaped = degrees.map((degree) => degree + shift);
  } else {
    shaped = degrees.map((degree) => Math.max(first - length, Math.min(first + length, 2 * first - degree)));
  }
  // Land home: the last note goes to the nearest tonic, the one before it to a step above or below.
  const last = shaped.length - 1;
  const tonic = Math.round(shaped[last] / length) * length;
  shaped[last] = tonic;
  if (last > 0 && variation !== 'echo') shaped[last - 1] = tonic + (shaped[last - 1] >= tonic ? 1 : -1);
  const out: NoteEvent[] = [];
  sorted.forEach((note, index) => {
    const pitch = fromDegree(shaped[index], key);
    out.push({ id: `phrase-${variation}-${index}`, step: note.step, pitch, durationSteps: note.durationSteps, ...(note.velocity !== undefined ? { velocity: note.velocity } : {}) });
  });
  if (variation === 'twist') {
    // Ornament the longest held note with a neighbour tone halfway through.
    const longest = out.reduce((best, note, index) => note.durationSteps > out[best].durationSteps ? index : best, 0);
    const note = out[longest];
    if (note.durationSteps >= 4 && longest !== out.length - 1) {
      const half = Math.floor(note.durationSteps / 2);
      const neighbour = fromDegree(toDegree(note.pitch, key) + (random() < 0.5 ? 1 : -1), key);
      out.splice(longest, 1,
        { ...note, durationSteps: half },
        { ...note, id: `${note.id}-b`, step: note.step + half, durationSteps: note.durationSteps - half, pitch: neighbour });
    }
  }
  return out;
}
