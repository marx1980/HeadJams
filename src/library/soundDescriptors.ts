import type { SoundDef } from '../model/project';

/** Find the sound (hum.md H8): describe what you hear in your head; rank melodic sounds by those words. */

export type Descriptor = 'warm' | 'bright' | 'dark' | 'soft' | 'punchy' | 'acoustic' | 'electronic' | 'smooth' | 'plucky' | 'sustained';

export const DESCRIPTORS: ReadonlyArray<{ id: Descriptor; label: string }> = [
  { id: 'warm', label: 'Warm' },
  { id: 'bright', label: 'Bright' },
  { id: 'dark', label: 'Dark' },
  { id: 'soft', label: 'Soft' },
  { id: 'punchy', label: 'Punchy' },
  { id: 'acoustic', label: 'Acoustic' },
  { id: 'electronic', label: 'Electronic' },
  { id: 'smooth', label: 'Smooth' },
  { id: 'plucky', label: 'Plucky' },
  { id: 'sustained', label: 'Sustained' },
];

/** Words that pull in opposite directions; choosing one counts against sounds tagged with the other. */
const OPPOSITES: [Descriptor, Descriptor][] = [
  ['warm', 'bright'], ['dark', 'bright'], ['soft', 'punchy'], ['acoustic', 'electronic'], ['plucky', 'sustained'], ['smooth', 'punchy'],
];

/** Descriptions of melodic and bass sounds (sampled instruments carry the same words in their manifests). */
export const SOUND_DESCRIPTORS: Readonly<Record<string, readonly Descriptor[]>> = {
  'grand-piano': ['acoustic', 'warm', 'bright', 'plucky'],
  'electric-piano': ['electronic', 'warm', 'soft', 'smooth', 'plucky'],
  'nylon-guitar': ['acoustic', 'warm', 'soft', 'plucky'],
  'clean-guitar': ['bright', 'plucky', 'smooth'],
  strings: ['acoustic', 'warm', 'smooth', 'sustained', 'soft'],
  brass: ['acoustic', 'bright', 'punchy', 'sustained'],
  'electric-bass': ['warm', 'punchy', 'plucky', 'acoustic'],
  harp: ['acoustic', 'warm', 'soft', 'plucky'],
  'pizzicato-strings': ['acoustic', 'punchy', 'plucky'],
  flute: ['acoustic', 'soft', 'smooth', 'sustained'],
  clarinet: ['acoustic', 'warm', 'smooth', 'sustained'],
  'french-horn': ['acoustic', 'warm', 'soft', 'sustained'],
  'church-organ': ['acoustic', 'warm', 'soft', 'sustained'],
  marimba: ['acoustic', 'warm', 'plucky', 'punchy'],
  glockenspiel: ['acoustic', 'bright', 'plucky'],
  bassoon: ['acoustic', 'warm', 'soft', 'sustained'],
  oboe: ['acoustic', 'bright', 'smooth', 'sustained'],
  piccolo: ['acoustic', 'bright', 'soft', 'sustained'],
  tuba: ['acoustic', 'warm', 'punchy', 'sustained'],
  'soprano-sax': ['acoustic', 'bright', 'smooth', 'sustained'],
  'alto-sax': ['acoustic', 'warm', 'smooth', 'sustained'],
  'tenor-sax': ['acoustic', 'warm', 'smooth', 'sustained'],
  'baritone-sax': ['acoustic', 'warm', 'dark', 'sustained'],
  viola: ['acoustic', 'warm', 'smooth', 'sustained'],
  contrabass: ['acoustic', 'warm', 'dark', 'sustained'],
  xylophone: ['acoustic', 'bright', 'plucky'],
  'tubular-bells': ['acoustic', 'bright', 'warm'],
  timpani: ['acoustic', 'warm', 'punchy'],
  'keys-1': ['soft', 'warm', 'electronic', 'smooth'],
  'keys-2': ['bright', 'electronic', 'plucky'],
  'keys-3': ['electronic', 'sustained', 'bright'],
  'strings-1': ['electronic', 'sustained', 'smooth'],
  'strings-2': ['electronic', 'plucky', 'bright'],
  'strings-3': ['electronic', 'warm', 'dark', 'soft', 'sustained', 'smooth'],
  'brass-1': ['electronic', 'bright', 'punchy', 'sustained'],
  'brass-2': ['electronic', 'soft', 'smooth', 'sustained'],
  'brass-3': ['electronic', 'dark', 'sustained'],
  'guitar-acoustic-1': ['electronic', 'soft', 'plucky'],
  'guitar-acoustic-2': ['electronic', 'bright', 'plucky'],
  'guitar-electric-1': ['electronic', 'smooth', 'plucky'],
  'guitar-electric-2': ['electronic', 'dark', 'punchy', 'plucky'],
  'guitar-electric-3': ['electronic', 'bright', 'soft'],
  'lead-1': ['electronic', 'bright', 'punchy'],
  'lead-2': ['electronic', 'bright', 'punchy', 'sustained'],
  'lead-3': ['electronic', 'soft', 'smooth'],
  'lead-4': ['electronic', 'bright', 'plucky'],
  'lead-6': ['electronic', 'warm', 'punchy', 'sustained'],
  'lead-7': ['electronic', 'bright', 'punchy'],
  'lead-8': ['electronic', 'warm', 'soft', 'sustained', 'smooth'],
  'lead-9': ['electronic', 'soft', 'plucky', 'bright'],
  'bass-1': ['electronic', 'dark', 'smooth', 'sustained'],
  'bass-2': ['electronic', 'dark', 'punchy'],
  'bass-3': ['electronic', 'dark', 'punchy'],
  'bass-4': ['electronic', 'punchy', 'plucky'],
  'bass-5': ['electronic', 'dark', 'sustained'],
  'bass-6': ['electronic', 'warm', 'plucky'],
  'bass-7': ['electronic', 'punchy', 'plucky'],
  'bass-8': ['electronic', 'bright', 'punchy', 'plucky'],
};

export interface RankedSound {
  sound: SoundDef;
  score: number;
  matches: Descriptor[];
}

/**
 * Melodic (or, for a bass line, bass) sounds ranked by how many chosen words describe them, minus opposites.
 * Real instruments win ties; with no words chosen, real instruments of the right kind come first.
 */
export function rankSounds(sounds: readonly SoundDef[], chosen: readonly Descriptor[], options: { bass: boolean }, limit = 6): RankedSound[] {
  const ranked = sounds.flatMap((sound): RankedSound[] => {
    const words = SOUND_DESCRIPTORS[sound.id];
    if (!words || sound.playbackMode === 'chord' || sound.playbackMode === 'one-shot') return [];
    const isBass = sound.category === 'Bass';
    if (options.bass !== isBass && !(options.bass && sound.id === 'grand-piano')) return [];
    const matches = chosen.filter((word) => words.includes(word));
    const against = chosen.filter((word) => OPPOSITES.some(([a, b]) => (a === word && words.includes(b)) || (b === word && words.includes(a)))).length;
    const score = matches.length * 2 - against + (sound.instrumentId ? 0.5 : 0);
    return [{ sound, score, matches }];
  });
  return ranked
    .filter((item) => !chosen.length || item.matches.length > 0)
    .sort((a, b) => b.score - a.score || a.sound.name.localeCompare(b.sound.name))
    .slice(0, limit);
}

/** A track counts as a bass line when most of its notes sit below E3. */
export function looksLikeBass(notes: readonly { pitch: number }[]): boolean {
  if (!notes.length) return false;
  const sorted = notes.map((note) => note.pitch).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] < 52;
}
