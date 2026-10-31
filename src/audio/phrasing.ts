import type { NoteEvent, PitchBendPoint, SoundDef } from '../model/project';

/**
 * Phrasing: turns a melody's notes into a played line (sax solo, string line, lead synth…).
 * Pure and seeded, so live playback and WAV export agree and a project always sounds the same.
 *
 * - Phrases are runs of notes separated by rests; each gets a dynamic arch, louder toward its peak.
 * - Sustained instruments (winds, brass, bowed strings, organ, lead synths) slur connected notes:
 *   the next note skips its attack and crossfades in, with a short pitch glide from the previous note.
 * - Long notes get a delayed vibrato and a gentle swell; phrase ends taper off.
 * - 'expressive' adds scoops into phrases and falls at their ends on sax and brass.
 * - Struck and plucked instruments (piano, guitar, mallets, harp…) only get the dynamics.
 */
export type PhrasingStyle = 'natural' | 'expressive';

export const PHRASING_STYLES: ReadonlyArray<{ id: PhrasingStyle; label: string }> = [
  { id: 'natural', label: 'Natural' },
  { id: 'expressive', label: 'Expressive' },
];

export const isPhrasingStyle = (value: unknown): value is PhrasingStyle =>
  PHRASING_STYLES.some((style) => style.id === value);

export interface PhrasingProfile {
  /** wind/bowed/organ/lead play legato lines; struck instruments only get dynamics. */
  kind: 'wind' | 'bowed' | 'organ' | 'lead' | 'struck';
  vibratoCents: number;
  vibratoHz: number;
  /** Scoops into phrases and falls at their ends (expressive style). */
  bends: boolean;
}

/** How a sampled voice should start, end and swell (read by the sampler; synth sounds ignore it). */
export interface VoiceExpression {
  /** Slurred from the previous note: skip the attack and fade in quickly. */
  legato?: boolean;
  /** Release override, so a slurred note crossfades into the next. */
  releaseSec?: number;
  /** Level multiplier over the note (seconds from the start), linearly interpolated. */
  gain?: PitchBendPoint[];
}

export interface PhrasedNote {
  velocity: number;
  durationSec?: number;
  pitchBend?: PitchBendPoint[];
  expression?: VoiceExpression;
}

const PROFILES: Record<string, PhrasingProfile> = {
  'soprano-sax': { kind: 'wind', vibratoCents: 24, vibratoHz: 5.6, bends: true },
  'alto-sax': { kind: 'wind', vibratoCents: 24, vibratoHz: 5.4, bends: true },
  'tenor-sax': { kind: 'wind', vibratoCents: 26, vibratoHz: 5.2, bends: true },
  'baritone-sax': { kind: 'wind', vibratoCents: 22, vibratoHz: 5.0, bends: true },
  flute: { kind: 'wind', vibratoCents: 16, vibratoHz: 5.4, bends: false },
  piccolo: { kind: 'wind', vibratoCents: 14, vibratoHz: 5.6, bends: false },
  oboe: { kind: 'wind', vibratoCents: 14, vibratoHz: 5.6, bends: false },
  bassoon: { kind: 'wind', vibratoCents: 12, vibratoHz: 5.2, bends: false },
  clarinet: { kind: 'wind', vibratoCents: 0, vibratoHz: 5, bends: false },
  brass: { kind: 'wind', vibratoCents: 10, vibratoHz: 5.2, bends: true },
  'french-horn': { kind: 'wind', vibratoCents: 6, vibratoHz: 5, bends: false },
  tuba: { kind: 'wind', vibratoCents: 6, vibratoHz: 4.8, bends: false },
  strings: { kind: 'bowed', vibratoCents: 14, vibratoHz: 5.8, bends: false },
  viola: { kind: 'bowed', vibratoCents: 16, vibratoHz: 5.6, bends: false },
  contrabass: { kind: 'bowed', vibratoCents: 12, vibratoHz: 5.0, bends: false },
  'church-organ': { kind: 'organ', vibratoCents: 0, vibratoHz: 5, bends: false },
};
const STRUCK: PhrasingProfile = { kind: 'struck', vibratoCents: 0, vibratoHz: 5, bends: false };

/** The phrasing behaviour for a sound, or undefined when phrasing does not apply (drums, chords, one-shots). */
export function phrasingProfile(sound: SoundDef): PhrasingProfile | undefined {
  if (sound.type === 'percussion' || sound.type === 'chord' || sound.playbackMode === 'chord' || sound.playbackMode === 'one-shot') return undefined;
  const known = PROFILES[sound.instrumentId ?? sound.id];
  if (known) return known;
  if (sound.instrumentId) {
    if (sound.category === 'Brass & Winds') return { kind: 'wind', vibratoCents: 12, vibratoHz: 5.3, bends: false };
    return STRUCK;
  }
  // Classic synth sounds: pads hold like an organ, leads and synth winds/strings sing.
  if (sound.subcategory === 'Pad') return { kind: 'organ', vibratoCents: 0, vibratoHz: 5, bends: false };
  if (sound.subcategory === 'Lead' || sound.category === 'Brass & Winds') return { kind: 'lead', vibratoCents: 15, vibratoHz: 5.5, bends: false };
  if (sound.category === 'Strings' && sound.id !== 'strings-2') return { kind: 'bowed', vibratoCents: 12, vibratoHz: 5.6, bends: false };
  return STRUCK;
}

/** Deterministic 0–1 hash of a string (FNV-1a). */
function unit(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967296;
}

/** Gap, in seconds, that ends a phrase. */
const PHRASE_BREAK_SEC = 0.3;
/** Notes closer than this (or overlapping) are slurred on sustained instruments. */
const SLUR_GAP_SEC = 0.12;
const LEGATO_CROSSFADE_SEC = 0.1;
const LEGATO_OVERLAP_SEC = 0.03;

export interface PhrasingOptions {
  style: PhrasingStyle;
  profile: PhrasingProfile;
  /** Seconds for a length in steps (the caller's tempo conversion). */
  durationOf: (steps: number) => number;
  stepsPerBar: number;
  /** Seeds the small per-note variations (project seed and channel id). */
  seed: string;
}

/** Phrase a track's notes. Notes not in the map (none today) play unchanged. */
export function phraseNotes(notes: readonly NoteEvent[], options: PhrasingOptions): Map<string, PhrasedNote> {
  const { style, profile, durationOf, stepsPerBar, seed } = options;
  const expressive = style === 'expressive';
  const sorted = [...notes].filter((note) => Number.isFinite(note.step) && Number.isFinite(note.pitch))
    .sort((a, b) => a.step - b.step || b.pitch - a.pitch);
  const startsAt = new Map<number, number>();
  for (const note of sorted) startsAt.set(note.step, (startsAt.get(note.step) ?? 0) + 1);
  const single = (note: NoteEvent) => startsAt.get(note.step) === 1;
  const startSec = (note: NoteEvent) => durationOf(note.step);
  const endSec = (note: NoteEvent) => durationOf(note.step + Math.max(0, note.durationSteps));

  // Phrases: split where the next note starts well after everything before it has ended.
  const phrases: NoteEvent[][] = [];
  let latestEnd = Number.NEGATIVE_INFINITY;
  for (const note of sorted) {
    if (!phrases.length || startSec(note) - latestEnd > PHRASE_BREAK_SEC) phrases.push([]);
    phrases[phrases.length - 1].push(note);
    latestEnd = Math.max(latestEnd, endSec(note));
  }

  const sustained = profile.kind !== 'struck';
  const depth = expressive ? 0.3 : 0.18;
  const result = new Map<string, PhrasedNote>();
  for (const phrase of phrases) {
    const starts = [...new Set(phrase.map((note) => note.step))];
    const mean = phrase.reduce((sum, note) => sum + note.pitch, 0) / phrase.length;
    for (let i = 0; i < phrase.length; i++) {
      const note = phrase[i];
      const index = starts.indexOf(note.step);
      // Dynamic arch peaking about 60% of the way through the phrase.
      const position = starts.length > 1 ? index / (starts.length - 1) : 0.5;
      const warped = position < 0.6 ? (position / 0.6) * 0.5 : 0.5 + ((position - 0.6) / 0.4) * 0.5;
      const arch = Math.sin(Math.PI * warped);
      const pitchLift = Math.max(-0.08, Math.min(0.08, ((note.pitch - mean) / 12) * 0.08));
      const beat = Math.max(1, Math.round(stepsPerBar / 4));
      const accent = note.step % stepsPerBar === 0 ? 0.04 : note.step % beat === 0 ? 0.02 : 0;
      const jitter = (unit(`${seed}:${note.id}:v`) - 0.5) * (expressive ? 0.1 : 0.06);
      const base = note.velocity ?? 0.85;
      const velocity = Math.max(0.25, Math.min(1, base * (1 - depth / 2 + depth * arch) + pitchLift + accent + jitter));
      const phrased: PhrasedNote = { velocity };
      result.set(note.id, phrased);
      if (!sustained || !single(note)) continue;

      // Slurs: connected to the previous single note, and the next one connected to this.
      const previous = index > 0 ? phrase.find((other) => other.step === starts[index - 1]) : undefined;
      const next = index < starts.length - 1 ? phrase.find((other) => other.step === starts[index + 1]) : undefined;
      const slurredFrom = previous && single(previous) && startSec(note) - endSec(previous) <= SLUR_GAP_SEC ? previous : undefined;
      const slursInto = next && single(next) && startSec(next) - endSec(note) <= SLUR_GAP_SEC ? next : undefined;
      // A slurred note holds a moment into the next one, so the next note is fully in before this one fades.
      const duration = slursInto ? durationOf(slursInto.step - note.step) + LEGATO_OVERLAP_SEC : durationOf(note.durationSteps);
      const firstOfPhrase = index === 0;
      const lastOfPhrase = index === starts.length - 1;
      const expression: VoiceExpression = {};
      if (slurredFrom) expression.legato = true;
      if (slursInto) {
        phrased.durationSec = duration;
        expression.releaseSec = LEGATO_CROSSFADE_SEC;
      }
      if (profile.kind !== 'organ' && duration >= 0.45) {
        const end = lastOfPhrase ? (expressive ? 0.55 : 0.72) : (expressive ? 0.86 : 0.92);
        expression.gain = [
          // A slurred note continues the line, so it does not swell up from a lower level.
          { time: 0, value: slurredFrom ? 0.97 : expressive ? 0.8 : 0.88 }, { time: duration * 0.5, value: 1 }, { time: duration, value: end },
        ];
      }
      if (Object.keys(expression).length) phrased.expression = expression;
      // A note that already carries its own bends (from a hummed take or the editor) keeps them.
      if (note.pitchBend?.length) continue;

      const bends: PitchBendPoint[] = [];
      let vibratoFrom = 0;
      if (slurredFrom && profile.kind !== 'organ' && slurredFrom.pitch !== note.pitch) {
        const glide = profile.kind === 'bowed' ? 0.03 : expressive ? 0.07 : 0.045;
        bends.push({ time: 0, value: Math.max(-12, Math.min(12, slurredFrom.pitch - note.pitch)) }, { time: glide, value: 0 });
        vibratoFrom = glide;
      } else if (expressive && profile.bends && firstOfPhrase && duration >= 0.2) {
        bends.push({ time: 0, value: -0.7 }, { time: 0.09, value: 0 });
        vibratoFrom = 0.09;
      }
      const fall = expressive && profile.bends && lastOfPhrase && duration >= 0.3;
      const vibratoEnd = fall ? duration - 0.12 : duration;
      if (profile.vibratoCents > 0 && duration >= 0.4) {
        const delay = Math.max(vibratoFrom, (profile.kind === 'bowed' ? 0.15 : expressive ? 0.2 : 0.3));
        const semis = (profile.vibratoCents / 100) * (expressive ? 1.4 : 1);
        const rate = profile.vibratoHz * (1 + (unit(`${seed}:${note.id}:r`) - 0.5) * 0.08);
        const quarter = 1 / (rate * 4);
        const shape = [0, 1, 0, -1];
        if (!bends.length) bends.push({ time: 0, value: 0 });
        for (let k = 0, t = delay; t < vibratoEnd; k++, t = delay + k * quarter) {
          const fade = Math.min(1, (t - delay) / 0.35);
          bends.push({ time: t, value: semis * fade * shape[k % 4] });
        }
      }
      if (fall) {
        const last = bends.at(-1);
        if (!last || last.time < duration - 0.12) bends.push({ time: duration - 0.12, value: last && last.time > duration - 0.3 ? last.value : 0 });
        bends.push({ time: duration + 0.1, value: -2 });
      }
      if (bends.length) phrased.pitchBend = bends;
    }
  }
  return result;
}
