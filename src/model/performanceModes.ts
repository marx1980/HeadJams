import type { DetectedNoteEvent, RecognitionEvent, RecognitionTake } from './recognition';
import { correctRecognitionPitches } from './recognitionProject';
import { quantiseRecognitionEvents } from '../library/quantisation';

/** How closely a captured idea follows the grid and the key (hum.md: Original / Cleaned / Tight). */
export type PerformanceMode = 'original' | 'cleaned' | 'tight';

export const PERFORMANCE_MODES: { id: PerformanceMode; label: string; beatLabel: string }[] = [
  { id: 'original', label: 'Original', beatLabel: 'Mine' },
  { id: 'cleaned', label: 'Cleaned', beatLabel: 'Tighter' },
  { id: 'tight', label: 'Tight', beatLabel: 'Grid' },
];

const SETTINGS: Record<PerformanceMode, {
  quantisation: RecognitionTake['quantisation']; pitchCorrection: number; scaleAwarePitch: boolean; glides: boolean;
}> = {
  original: { quantisation: { enabled: false, strength: 0, subdivision: 'sixteenth' }, pitchCorrection: 0, scaleAwarePitch: false, glides: false },
  cleaned: { quantisation: { enabled: true, strength: 0.5, subdivision: 'sixteenth' }, pitchCorrection: 0.5, scaleAwarePitch: false, glides: true },
  tight: { quantisation: { enabled: true, strength: 1, subdivision: 'sixteenth' }, pitchCorrection: 1, scaleAwarePitch: true, glides: true },
};

/** Shortest note kept between two neighbours when it sits in the slide from one to the other. */
const GLIDE_MAX_SECONDS = 0.14;
const GLIDE_MAX_GAP_SECONDS = 0.06;

/**
 * Remove short notes that are only the slide between two sung pitches (e.g. a brief F between G and E),
 * giving their time to the previous note. Repeated notes and real short notes are kept.
 */
export function cleanGlides<T extends RecognitionEvent>(events: readonly T[]): T[] {
  const notes = events.filter((event): event is T & DetectedNoteEvent => 'pitch' in event)
    .map((event) => ({ ...event })).sort((a, b) => a.startSeconds - b.startSeconds);
  const others = events.filter((event) => !('pitch' in event));
  const kept: (T & DetectedNoteEvent)[] = [];
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const previous = kept.at(-1);
    const next = notes[i + 1];
    if (previous && next && note.durationSeconds <= GLIDE_MAX_SECONDS) {
      const gapBefore = note.startSeconds - (previous.startSeconds + previous.durationSeconds);
      const gapAfter = next.startSeconds - (note.startSeconds + note.durationSeconds);
      const low = Math.min(previous.pitch, next.pitch) - 1;
      const high = Math.max(previous.pitch, next.pitch) + 1;
      const between = note.pitch >= low && note.pitch <= high && note.pitch !== next.pitch;
      if (between && gapBefore <= GLIDE_MAX_GAP_SECONDS && gapAfter <= GLIDE_MAX_GAP_SECONDS) {
        previous.durationSeconds = Math.max(previous.durationSeconds, note.startSeconds + note.durationSeconds - previous.startSeconds);
        continue;
      }
    }
    kept.push(note);
  }
  return [...others, ...kept].sort((a, b) => a.startSeconds - b.startSeconds) as T[];
}

/** Re-derive a take's events from its original detection using one of the three performance presets. */
export function applyPerformanceMode(take: RecognitionTake, mode: PerformanceMode, bpm: number, noteLength: number, scaleRoot: number, scaleId: string): RecognitionTake {
  const settings = SETTINGS[mode];
  const isBeat = take.mode === 'beat';
  const correction = {
    pitchCorrection: isBeat ? 0 : settings.pitchCorrection,
    scaleAwarePitch: isBeat ? false : settings.scaleAwarePitch,
    scaleRoot, scaleId, transposeSemitones: take.transposeSemitones,
  };
  // Clean glides on the raw detection: snapping to the key first can turn a glide into a fake repeated note.
  const source = !isBeat && settings.glides ? cleanGlides(take.originalEvents) : take.originalEvents;
  const events = correctRecognitionPitches(source, correction);
  const quantisedEvents = settings.quantisation.enabled
    ? quantiseRecognitionEvents(events, bpm, noteLength, settings.quantisation.subdivision, settings.quantisation.strength)
    : events;
  return {
    ...take,
    ...correction,
    quantisation: { ...settings.quantisation },
    tempoBpm: bpm,
    performance: mode,
    quantisedEvents,
  };
}
