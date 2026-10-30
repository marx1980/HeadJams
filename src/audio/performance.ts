import {
  audibleChannels, channelsForPlaybackStep, type ChordEvent, type PitchBendPoint, type Project, type SoundDef,
} from '../model/project';
import { findSound } from '../library/sounds';
import { guitarChordPitches } from '../model/music';
import { CHORD_STRING_LEVEL, performChord, voiceChordSequence } from '../library/guitar/performer';
import { chordArticulation, recordedChordFor } from '../model/personalInstrument';

/** Seconds between strings in a strummed chord. */
export const STRUM_STAGGER_SEC = 0.018;
/** Muted chords are cut to at most this length. */
export const MUTED_CHORD_MAX_SEC = 0.08;
/** Velocity scale applied to muted chords. */
export const MUTED_CHORD_VELOCITY = 0.75;

interface VoiceBase {
  sound: SoundDef;
  channelId: string;
  /** Seconds after the start of the step. */
  offsetSec: number;
  volume: number;
  pan: number;
}

/** A one-shot trigger from the step grid. */
export interface HitVoice extends VoiceBase {
  kind: 'hit';
}

/** A pitched voice from a piano-roll note or one string of a chord. */
export interface PitchedVoice extends VoiceBase {
  kind: 'pitched';
  origin: 'note' | 'chord';
  pitch: number;
  durationSec: number;
  /** Left undefined when the source event has none, so renderers keep their own default. */
  velocity?: number;
  pitchBend?: PitchBendPoint[];
  /** Sampled guitars: voices sharing a key on a channel cut each other (one per string, or the whole chord when tight). */
  chokeKey?: string | string[];
}

export type VoiceEvent = HitVoice | PitchedVoice;

/**
 * Compile everything that starts on one playback step into voice events.
 * Shared by live playback (engine.ts) and WAV export (render.ts) so both always agree.
 * `durationOf` converts a length in steps to seconds; each caller passes its own
 * conversion so its existing arithmetic (and therefore its output) is unchanged.
 */
export function compileStep(p: Project, step: number, durationOf: (steps: number) => number): VoiceEvent[] {
  const voices: VoiceEvent[] = [];
  for (const source of channelsForPlaybackStep(p, step)) {
    for (const c of audibleChannels({ ...p, channels: source.channels })) {
      const sound = findSound(p, c.soundId);
      if (!sound) continue;
      const base = { sound, channelId: c.id, volume: c.volume, pan: c.pan };
      if (c.steps[source.localStep]) voices.push({ ...base, kind: 'hit', offsetSec: 0 });
      for (const lane of c.lanes ?? []) {
        if (lane.mute || !lane.steps[source.localStep]) continue;
        const laneSound = findSound(p, lane.soundId);
        if (laneSound) voices.push({ ...base, sound: laneSound, kind: 'hit', offsetSec: 0 });
      }
      for (const note of c.notes ?? []) {
        if (note.step !== source.localStep) continue;
        voices.push({
          ...base, kind: 'pitched', origin: 'note', offsetSec: 0, pitch: note.pitch,
          durationSec: durationOf(note.durationSteps), velocity: note.velocity, pitchBend: note.pitchBend,
        });
      }
      if (c.playOriginal && c.original) {
        const startStep = Math.max(0, Math.floor(c.original.offsetSec / durationOf(1) + 1e-9));
        const originalSound = startStep === source.localStep ? findSound(p, c.original.soundId) : undefined;
        if (originalSound) {
          voices.push({
            sound: originalSound, channelId: c.id, kind: 'hit', volume: c.volume, pan: c.pan,
            offsetSec: Math.max(0, c.original.offsetSec - durationOf(startStep)),
          });
        }
      }
      if (sound.playbackMode !== 'chord') continue;
      if (sound.instrumentId) {
        voices.push(...compileSampledChords(p, c.id, c.chordEvents ?? [], source.localStep, base, durationOf));
        continue;
      }
      for (const event of c.chordEvents ?? []) {
        if (event.step !== source.localStep) continue;
        const all = guitarChordPitches(event.root, event.quality, event.articulation);
        // Chord-row arpeggios pick strings (1 = lowest); older events have no subset and play every string.
        const pitches = event.strings?.length
          ? [...new Set(event.strings.map((index) => Math.max(1, Math.min(all.length, Math.round(index)))))].map((index) => all[index - 1])
          : all;
        if (event.articulation === 'up-strum') pitches.reverse();
        const muted = event.articulation === 'muted';
        const strummed = event.articulation === 'down-strum' || event.articulation === 'up-strum';
        const duration = muted ? Math.min(MUTED_CHORD_MAX_SEC, durationOf(event.durationSteps)) : durationOf(event.durationSteps);
        const velocity = (event.velocity ?? 1) * (muted ? MUTED_CHORD_VELOCITY : 1);
        for (let index = 0; index < pitches.length; index++) {
          const gap = event.strumMs !== undefined && Number.isFinite(event.strumMs) && pitches.length > 1
            ? Math.max(0, Math.min(200, event.strumMs)) / 1000 / (pitches.length - 1)
            : STRUM_STAGGER_SEC;
          const stagger = strummed ? index * gap : 0;
          voices.push({
            ...base, kind: 'pitched', origin: 'chord', offsetSec: stagger, pitch: pitches[index],
            durationSec: Math.max(0.01, duration - stagger), velocity,
          });
        }
      }
    }
  }
  return voices;
}

/**
 * Sampled guitars (expansion.md E3): real chord shapes, string-by-string strums with seeded humanise,
 * and per-string choke so a new chord only stops the strings it plays ('tight' stops the whole chord).
 * Classic synth guitars keep the path above unchanged.
 */
function compileSampledChords(
  p: Project, channelId: string, events: readonly ChordEvent[], step: number,
  base: { sound: SoundDef; channelId: string; volume: number; pan: number },
  durationOf: (steps: number) => number,
): PitchedVoice[] {
  const starting = events.filter((event) => event.step === step);
  if (!starting.length) return [];
  const voicings = voiceChordSequence(events);
  const tight = base.sound.chordRing === 'tight';
  const voices: PitchedVoice[] = [];
  const recorded = base.sound.recordedChordsId
    ? p.personalInstruments?.find((instrument) => instrument.id === base.sound.recordedChordsId)
    : undefined;
  for (const event of starting) {
    // Recorded chords (E7) play whole; they hold every string so a built chord after them cuts them, and vice versa.
    const take = recorded?.chords && recordedChordFor(recorded.chords, event);
    if (take && recorded) {
      const length = durationOf(event.durationSteps);
      voices.push({
        ...base,
        sound: { ...base.sound, instrumentId: recorded.id, instrumentArticulation: chordArticulation(take.root, take.quality, take.direction) },
        kind: 'pitched', origin: 'chord', offsetSec: 0, pitch: 60, durationSec: Math.max(0.01, length),
        velocity: Math.max(0, Math.min(1, event.velocity ?? 1)),
        chokeKey: ['chord', 'string0', 'string1', 'string2', 'string3', 'string4', 'string5'],
      });
      continue;
    }
    const voicing = voicings.get(event.id);
    if (!voicing) continue;
    const muted = event.articulation === 'muted';
    const length = durationOf(event.durationSteps);
    const duration = muted ? Math.min(MUTED_CHORD_MAX_SEC, length) : length;
    const strokes = performChord(event, voicing, `${p.seed ?? 1}:${channelId}:${event.id}`);
    for (const stroke of strokes) {
      voices.push({
        ...base, volume: base.volume * CHORD_STRING_LEVEL,
        kind: 'pitched', origin: 'chord', offsetSec: stroke.offsetSec, pitch: stroke.pitch,
        durationSec: Math.max(0.01, duration - stroke.offsetSec),
        velocity: stroke.velocity * (muted ? MUTED_CHORD_VELOCITY : 1),
        chokeKey: tight ? 'chord' : `string${stroke.string}`,
      });
    }
  }
  return voices;
}
