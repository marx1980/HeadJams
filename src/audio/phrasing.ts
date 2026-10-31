import type { NoteEvent, PhrasingStyle, PitchBendPoint, SoundDef, SungContour } from '../model/project';

export type { PhrasingStyle } from '../model/project';

/**
 * Phrasing: turns a melody's notes into a played line (sax solo, string line, lead synth…).
 * Pure and seeded, so live playback and WAV export agree and a project always sounds the same.
 *
 * - A hummed note plays the way it was sung: its loudness and pitch contour (slides, vibrato) carry over.
 *   The rules below only fill in what the take does not have.
 * - Phrases are runs of notes separated by rests; each gets a dynamic arch, louder toward its peak.
 * - Sustained instruments (winds, brass, bowed strings, organ, lead synths) slur connected notes:
 *   the next note starts past its sample's attack and crossfades in, with a short pitch glide.
 *   Short detached notes use real staccato recordings where the instrument has them.
 * - Long notes get vibrato and a swell that also moves from the soft to the loud recording.
 * - Winds breathe: a quiet breath before phrases and a short break inside very long ones.
 * - Feels (Natural, Expressive, Jazz, Classical, Pop) set how much of each, plus timing.
 * - Struck and plucked instruments (piano, guitar, mallets, harp…) only get dynamics and feel.
 */
export const PHRASING_STYLES: ReadonlyArray<{ id: PhrasingStyle; label: string }> = [
  { id: 'natural', label: 'Natural' },
  { id: 'expressive', label: 'Expressive' },
  { id: 'jazz', label: 'Jazz' },
  { id: 'classical', label: 'Classical' },
  { id: 'pop', label: 'Pop' },
];

export const isPhrasingStyle = (value: unknown): value is PhrasingStyle =>
  PHRASING_STYLES.some((style) => style.id === value);

export interface PhrasingProfile {
  /** wind/bowed/organ/lead play legato lines; struck instruments only get dynamics. */
  kind: 'wind' | 'bowed' | 'organ' | 'lead' | 'struck';
  vibratoCents: number;
  vibratoHz: number;
  /** Scoops into phrases and falls at their ends (sax and brass). */
  bends: boolean;
}

/** How a sampled voice should start, end and swell (read by the sampler; synth sounds ignore it). */
export interface VoiceExpression {
  /** Slurred from the previous note: skip the attack and fade in quickly. */
  legato?: boolean;
  /** Extra seconds into the sample for a slurred start, so repeated slurs do not all start alike. */
  startJitterSec?: number;
  /** Release override, so a slurred note crossfades into the next. */
  releaseSec?: number;
  /** Level multiplier over the note (seconds from the start), linearly interpolated. */
  gain?: PitchBendPoint[];
  /** Blend from the soft to the loud recording as the level rises. */
  blend?: boolean;
  /** Recorded articulation to use (staccato, breath, keys); falls back to the default if missing. */
  articulation?: string;
  /** Skip the voice when the instrument has no recording of `articulation` (breath and key noise). */
  optional?: boolean;
}

export interface PhrasedNote {
  velocity: number;
  /** Seconds after the note's step (feel: laid-back timing). */
  offsetSec?: number;
  durationSec?: number;
  pitchBend?: PitchBendPoint[];
  expression?: VoiceExpression;
}

/** An extra sound the performer adds: a breath before a phrase or a key click. */
export interface PhrasedExtra {
  step: number;
  offsetSec: number;
  pitch: number;
  durationSec: number;
  velocity: number;
  /** Level relative to the track. */
  level: number;
  expression: VoiceExpression;
}

export interface PhrasedTrack {
  notes: Map<string, PhrasedNote>;
  extras: PhrasedExtra[];
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

/** How much of everything each feel uses. */
interface Feel {
  /** Size of the dynamic arch over a phrase. */
  depth: number;
  jitter: number;
  vibrato: number;
  /** Seconds before vibrato starts on a long note (late = jazz "terminal" vibrato). */
  vibratoDelay: number;
  scoops: boolean;
  falls: boolean;
  glide: number;
  /** Notes closer than this are slurred. */
  slurGap: number;
  /** Laid-back timing: every note, and extra on off-beats. */
  layBack: number;
  offbeatLayBack: number;
  breath: boolean;
  keys: boolean;
  /** Swell start level and the level a phrase tapers to. */
  swellFrom: number;
  taper: number;
  /** How much of a sung contour carries over (pitch, level). */
  sungPitch: number;
  sungLevel: number;
}

const FEELS: Record<PhrasingStyle, Feel> = {
  natural: {
    depth: 0.18, jitter: 0.06, vibrato: 1, vibratoDelay: 0.3, scoops: false, falls: false, glide: 0.045, slurGap: 0.12,
    layBack: 0, offbeatLayBack: 0, breath: true, keys: false, swellFrom: 0.88, taper: 0.72, sungPitch: 0.7, sungLevel: 0.6,
  },
  expressive: {
    depth: 0.3, jitter: 0.1, vibrato: 1.4, vibratoDelay: 0.2, scoops: true, falls: true, glide: 0.07, slurGap: 0.12,
    layBack: 0, offbeatLayBack: 0, breath: true, keys: true, swellFrom: 0.8, taper: 0.55, sungPitch: 1, sungLevel: 0.85,
  },
  jazz: {
    depth: 0.26, jitter: 0.08, vibrato: 1.3, vibratoDelay: 0.4, scoops: true, falls: true, glide: 0.06, slurGap: 0.1,
    layBack: 0.012, offbeatLayBack: 0.018, breath: true, keys: true, swellFrom: 0.84, taper: 0.6, sungPitch: 0.9, sungLevel: 0.8,
  },
  classical: {
    depth: 0.22, jitter: 0.04, vibrato: 1, vibratoDelay: 0.12, scoops: false, falls: false, glide: 0.035, slurGap: 0.2,
    layBack: 0, offbeatLayBack: 0, breath: true, keys: false, swellFrom: 0.85, taper: 0.7, sungPitch: 0.6, sungLevel: 0.7,
  },
  pop: {
    depth: 0.14, jitter: 0.05, vibrato: 0.6, vibratoDelay: 0.35, scoops: true, falls: false, glide: 0.04, slurGap: 0.1,
    layBack: 0, offbeatLayBack: 0, breath: true, keys: false, swellFrom: 0.9, taper: 0.8, sungPitch: 0.7, sungLevel: 0.6,
  },
};

/** Deterministic 0–1 hash of a string (FNV-1a). */
function unit(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967296;
}

/** Gap, in seconds, that ends a phrase. */
const PHRASE_BREAK_SEC = 0.3;
/** A slur hands over quickly: the old note fades in 50 ms, 15 ms after the new one starts (one reed, one note). */
const LEGATO_CROSSFADE_SEC = 0.05;
const LEGATO_OVERLAP_SEC = 0.015;
/** Monophonic instruments: a note's release never rings on under the next note for longer than this. */
const HANDOVER_SEC = 0.05;
/** Detached notes this short use the staccato recording. */
const STACCATO_MAX_SEC = 0.22;
/** Winds take a breath inside a phrase after this long. */
const BREATH_EVERY_SEC = 6;
const BREATH_CUT_SEC = 0.15;
const BREATH_SEC = 0.32;

export interface PhrasingOptions {
  style: PhrasingStyle;
  profile: PhrasingProfile;
  /** Seconds for a length in steps (the caller's tempo conversion). */
  durationOf: (steps: number) => number;
  stepsPerBar: number;
  /** Seeds the small per-note variations (project seed and channel id). */
  seed: string;
}

/**
 * One note at a time: how a monophonic instrument's note ends when the next one follows closely.
 * It stops when the next starts (plus a short overlap) and fades fast, instead of ringing on under it.
 */
function monoHandover(start: number, duration: number, nextStart: number): { durationSec?: number; releaseSec: number } | undefined {
  const end = start + duration;
  if (nextStart < end) return { durationSec: Math.max(0.03, nextStart - start + LEGATO_OVERLAP_SEC), releaseSec: HANDOVER_SEC };
  const gap = nextStart - end;
  return gap < 0.25 ? { releaseSec: Math.max(HANDOVER_SEC, gap) } : undefined;
}

/**
 * Monophonic sampled instruments (saxes, woodwinds, brass) play one note at a time even with phrasing off:
 * in a single-note line each note hands over to the next instead of overlapping it. Chords are left alone.
 */
export function monophonicLine(notes: readonly NoteEvent[], durationOf: (steps: number) => number): Map<string, { durationSec?: number; releaseSec: number }> {
  const sorted = [...notes].filter((note) => Number.isFinite(note.step) && Number.isFinite(note.pitch)).sort((a, b) => a.step - b.step);
  const startsAt = new Map<number, number>();
  for (const note of sorted) startsAt.set(note.step, (startsAt.get(note.step) ?? 0) + 1);
  const result = new Map<string, { durationSec?: number; releaseSec: number }>();
  for (let i = 0; i < sorted.length; i++) {
    const note = sorted[i];
    if (startsAt.get(note.step) !== 1) continue;
    const next = sorted.slice(i + 1).find((other) => other.step > note.step);
    if (!next || startsAt.get(next.step) !== 1) continue;
    const handover = monoHandover(durationOf(note.step), durationOf(Math.max(0, note.durationSteps)), durationOf(next.step));
    if (handover) result.set(note.id, handover);
  }
  return result;
}

/** Phrase a track's notes (see phraseTrack). */
export function phraseNotes(notes: readonly NoteEvent[], options: PhrasingOptions): Map<string, PhrasedNote> {
  return phraseTrack(notes, options).notes;
}

/** Smooth a contour with a 3-point median, then centre it on its median and scale it. */
function shapeContour(points: readonly PitchBendPoint[], scale: number, low: number, high: number, center: number): PitchBendPoint[] {
  const values = points.map((point) => point.value);
  // 3-point median; the end points stay as sung (an onset or a tail is not an outlier).
  const smoothed = values.map((value, i) => {
    if (i === 0 || i === values.length - 1) return value;
    return [values[i - 1], value, values[i + 1]].sort((a, b) => a - b)[1];
  });
  const sorted = [...smoothed].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return points.map((point, i) => ({
    time: point.time,
    value: Math.max(low, Math.min(high, center + (smoothed[i] - mid) * scale)),
  }));
}

const usableSung = (sung: SungContour | undefined, key: 'pitch' | 'level') => (sung?.[key]?.length ?? 0) >= 3;

/** Phrase a track: shaped notes plus the breaths and key clicks around them. */
export function phraseTrack(notes: readonly NoteEvent[], options: PhrasingOptions): PhrasedTrack {
  const { style, profile, durationOf, stepsPerBar, seed } = options;
  const feel = FEELS[style] ?? FEELS.natural;
  const sorted = [...notes].filter((note) => Number.isFinite(note.step) && Number.isFinite(note.pitch))
    .sort((a, b) => a.step - b.step || b.pitch - a.pitch);
  const startsAt = new Map<number, number>();
  for (const note of sorted) startsAt.set(note.step, (startsAt.get(note.step) ?? 0) + 1);
  const single = (note: NoteEvent) => startsAt.get(note.step) === 1;
  const startSec = (note: NoteEvent) => durationOf(note.step);
  const endSec = (note: NoteEvent) => durationOf(note.step + Math.max(0, note.durationSteps));
  const wind = profile.kind === 'wind';
  const beat = Math.max(1, Math.round(stepsPerBar / 4));

  // Phrases: split where the next note starts well after everything before it has ended,
  // and (winds) where a long phrase reaches a beat after BREATH_EVERY_SEC without a rest.
  const phrases: NoteEvent[][] = [];
  const breathCut = new Set<string>();
  let latestEnd = Number.NEGATIVE_INFINITY;
  let phraseStart = 0;
  for (const note of sorted) {
    const current = phrases.at(-1);
    const rest = startSec(note) - latestEnd > PHRASE_BREAK_SEC;
    const previous = current?.at(-1);
    const needsBreath = wind && current && previous && !rest && previous.step !== note.step
      && startSec(note) - phraseStart > BREATH_EVERY_SEC && note.step % beat === 0
      && durationOf(previous.durationSteps) >= 0.25 && single(previous);
    if (!current || rest || needsBreath) {
      if (needsBreath && previous) breathCut.add(previous.id);
      phrases.push([]);
      phraseStart = startSec(note);
    }
    phrases[phrases.length - 1].push(note);
    latestEnd = Math.max(latestEnd, endSec(note));
  }

  const sustained = profile.kind !== 'struck';
  const notesOut = new Map<string, PhrasedNote>();
  const extras: PhrasedExtra[] = [];
  const lay = (note: NoteEvent) => feel.layBack + (note.step % beat !== 0 ? feel.offbeatLayBack : 0);

  for (let p = 0; p < phrases.length; p++) {
    const phrase = phrases[p];
    const starts = [...new Set(phrase.map((note) => note.step))];
    const mean = phrase.reduce((sum, note) => sum + note.pitch, 0) / phrase.length;

    // A breath before the phrase (winds), when there is room for it.
    const first = phrase[0];
    const before = p > 0 ? phrases[p - 1] : undefined;
    const gapBefore = before ? startSec(first) - Math.max(...before.map(endSec)) : Number.POSITIVE_INFINITY;
    const afterCut = before ? breathCut.has(before.at(-1)!.id) : false;
    if (wind && feel.breath && (gapBefore >= 0.35 || afterCut)) {
      const length = afterCut ? BREATH_CUT_SEC : BREATH_SEC;
      const at = startSec(first) + lay(first) - length;
      const stepLength = durationOf(1);
      const step = Math.floor(at / stepLength + 1e-9);
      if (step >= 0) {
        extras.push({
          step, offsetSec: Math.max(0, at - durationOf(step)), pitch: first.pitch, durationSec: length,
          // The recordings are already levelled well below the sustained sound (scripts/add-articulation.py).
          velocity: 1, level: style === 'classical' ? 0.7 : 1,
          expression: { articulation: 'breath', optional: true },
        });
      }
    }

    for (let i = 0; i < phrase.length; i++) {
      const note = phrase[i];
      const index = starts.indexOf(note.step);
      // Dynamic arch peaking about 60% of the way through the phrase.
      const position = starts.length > 1 ? index / (starts.length - 1) : 0.5;
      const warped = position < 0.6 ? (position / 0.6) * 0.5 : 0.5 + ((position - 0.6) / 0.4) * 0.5;
      const arch = Math.sin(Math.PI * warped);
      const pitchLift = Math.max(-0.08, Math.min(0.08, ((note.pitch - mean) / 12) * 0.08));
      const accent = note.step % stepsPerBar === 0 ? 0.04 : note.step % beat === 0 ? 0.02 : 0;
      const jitter = (unit(`${seed}:${note.id}:v`) - 0.5) * feel.jitter;
      const base = note.velocity ?? 0.92;
      const velocity = Math.max(0.25, Math.min(1, base * (1 - feel.depth / 2 + feel.depth * arch) + pitchLift + accent + jitter));
      const phrased: PhrasedNote = { velocity };
      const offset = lay(note);
      if (offset > 0) phrased.offsetSec = offset;
      notesOut.set(note.id, phrased);
      if (!sustained || !single(note)) continue;

      // Slurs: connected to the previous single note, and the next one connected to this.
      const previous = index > 0 ? phrase.find((other) => other.step === starts[index - 1]) : undefined;
      const next = index < starts.length - 1 ? phrase.find((other) => other.step === starts[index + 1]) : undefined;
      const slurredFrom = previous && single(previous) && startSec(note) - endSec(previous) <= feel.slurGap ? previous : undefined;
      const slursInto = next && single(next) && startSec(next) - endSec(note) <= feel.slurGap ? next : undefined;
      const written = durationOf(note.durationSteps);
      // A slurred note holds a moment into the next one, so the next note is fully in before this one fades.
      let duration = slursInto ? durationOf(slursInto.step - note.step) + LEGATO_OVERLAP_SEC + lay(slursInto) - offset : written;
      if (breathCut.has(note.id)) duration = Math.max(written * 0.5, written - BREATH_CUT_SEC);
      const firstOfPhrase = index === 0;
      const lastOfPhrase = index === starts.length - 1;
      const expression: VoiceExpression = {};
      if (slurredFrom) {
        expression.legato = true;
        expression.startJitterSec = Math.round(unit(`${seed}:${note.id}:o`) * 0.05 * 1000) / 1000;
      }
      if (slursInto) expression.releaseSec = LEGATO_CROSSFADE_SEC;
      else if (wind) {
        const after = sorted.find((other) => other.step > note.step);
        const handover = after && single(after) ? monoHandover(startSec(note) + offset, duration, startSec(after) + lay(after)) : undefined;
        if (handover) {
          duration = handover.durationSec ?? duration;
          expression.releaseSec = handover.releaseSec;
        }
      }
      if (duration !== written) phrased.durationSec = duration;
      if (!slurredFrom && !slursInto && duration <= STACCATO_MAX_SEC && profile.kind !== 'organ') {
        expression.articulation = 'staccato';
      }

      if (usableSung(note.sung, 'level')) {
        // Loudness as sung, relative to the note's own level.
        const gain = shapeContour(note.sung!.level, feel.sungLevel, 0.3, 1.25, 1).filter((point) => point.time <= duration + 0.05);
        if (gain.length) expression.gain = gain;
      } else if (profile.kind !== 'organ' && duration >= 0.45) {
        const end = lastOfPhrase ? feel.taper : 1 - (1 - feel.taper) / 3;
        expression.gain = [
          // A slurred note continues the line, so it does not swell up from a lower level.
          { time: 0, value: slurredFrom ? 0.97 : feel.swellFrom }, { time: duration * 0.5, value: 1 }, { time: duration, value: end },
        ];
      }
      if (expression.gain && profile.kind !== 'organ' && duration >= 0.3) expression.blend = true;
      if (Object.keys(expression).length) phrased.expression = expression;

      // Key clicks on note changes inside a phrase (sax and brass, expressive feels).
      if (wind && profile.bends && feel.keys && slurredFrom && slurredFrom.pitch !== note.pitch) {
        extras.push({
          step: note.step, offsetSec: offset, pitch: note.pitch, durationSec: 0.1, velocity: 1, level: 1,
          expression: { articulation: 'keys', optional: true },
        });
      }

      if (profile.kind === 'organ') continue;
      if (usableSung(note.sung, 'pitch')) {
        // Slides and vibrato as sung, centred so the note stays in tune.
        phrased.pitchBend = shapeContour(note.sung!.pitch, feel.sungPitch, -2, 2, 0).filter((point) => point.time <= duration + 0.1);
        continue;
      }
      // An older hummed note keeps the bends it already carries.
      if (note.pitchBend?.length) continue;

      const bends: PitchBendPoint[] = [];
      let vibratoFrom = 0;
      if (slurredFrom && slurredFrom.pitch !== note.pitch) {
        const glide = profile.kind === 'bowed' ? Math.min(0.03, feel.glide) : feel.glide;
        bends.push({ time: 0, value: Math.max(-12, Math.min(12, slurredFrom.pitch - note.pitch)) }, { time: glide, value: 0 });
        vibratoFrom = glide;
      } else if (feel.scoops && profile.bends && firstOfPhrase && duration >= 0.2) {
        bends.push({ time: 0, value: -0.7 }, { time: 0.09, value: 0 });
        vibratoFrom = 0.09;
      }
      const fall = feel.falls && profile.bends && lastOfPhrase && duration >= 0.3 && !breathCut.has(note.id);
      const vibratoEnd = fall ? duration - 0.12 : duration;
      if (profile.vibratoCents > 0 && feel.vibrato > 0 && duration >= 0.4) {
        const delay = Math.max(vibratoFrom, profile.kind === 'bowed' ? Math.min(0.15, feel.vibratoDelay) : feel.vibratoDelay);
        const semis = (profile.vibratoCents / 100) * feel.vibrato;
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
  return { notes: notesOut, extras };
}
