import {
  audibleChannels, channelsForPlaybackStep, type PitchBendPoint, type Project, type SoundDef,
} from '../model/project';
import { findSound } from '../library/sounds';
import { guitarChordPitches } from '../model/music';

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
      for (const event of c.chordEvents ?? []) {
        if (event.step !== source.localStep) continue;
        const pitches = guitarChordPitches(event.root, event.quality, event.articulation);
        if (event.articulation === 'up-strum') pitches.reverse();
        const muted = event.articulation === 'muted';
        const strummed = event.articulation === 'down-strum' || event.articulation === 'up-strum';
        const duration = muted ? Math.min(MUTED_CHORD_MAX_SEC, durationOf(event.durationSteps)) : durationOf(event.durationSteps);
        const velocity = (event.velocity ?? 1) * (muted ? MUTED_CHORD_VELOCITY : 1);
        for (let index = 0; index < pitches.length; index++) {
          const stagger = strummed ? index * STRUM_STAGGER_SEC : 0;
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
