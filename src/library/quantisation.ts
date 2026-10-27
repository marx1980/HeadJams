import type {
  DetectedNoteEvent, PercussionEvent, QuantisationSubdivision, RecognitionEvent,
} from '../model/recognition';

const SUBDIVISIONS: Record<QuantisationSubdivision, number> = {
  quarter: 1,
  eighth: 2,
  sixteenth: 4,
};

function gridStepSeconds(bpm: number, noteLength: number, subdivision: QuantisationSubdivision): number {
  return 60 / bpm / SUBDIVISIONS[subdivision];
}

export function quantiseTime(
  seconds: number,
  bpm: number,
  noteLength: number,
  subdivision: QuantisationSubdivision,
  strength: number,
): number {
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(bpm) || bpm <= 0
    || ![4, 8, 16].includes(noteLength)) return Math.max(0, seconds || 0);
  const unit = gridStepSeconds(bpm, noteLength, subdivision);
  const boundedStrength = Math.max(0, Math.min(1, strength));
  return Math.max(0, seconds + (Math.round(seconds / unit) * unit - seconds) * boundedStrength);
}

export function quantiseRecognitionEvents<T extends RecognitionEvent>(
  events: readonly T[],
  bpm: number,
  noteLength: number,
  subdivision: QuantisationSubdivision,
  strength: number,
): T[] {
  return events.map((event) => {
    const startSeconds = quantiseTime(event.startSeconds, bpm, noteLength, subdivision, strength);
    if ('durationSeconds' in event) {
      const adjusted = quantiseTime(
        event.startSeconds + event.durationSeconds, bpm, noteLength, subdivision, strength,
      ) - startSeconds;
      return {
        ...event,
        startSeconds,
        durationSeconds: Math.max(gridStepSeconds(bpm, noteLength, subdivision) / 4, adjusted),
        ...(event.pitchBend ? { pitchBend: event.pitchBend.map((point) => ({ ...point })) } : {}),
      } as T;
    }
    return { ...event, startSeconds } as T;
  });
}

export function noteEventToSteps(
  event: DetectedNoteEvent,
  bpm: number,
  noteLength: number,
  strength = 1,
  subdivision: QuantisationSubdivision = 'sixteenth',
): { step: number; durationSteps: number } {
  const secondsPerStep = 60 / bpm * 4 / noteLength;
  const start = quantiseTime(event.startSeconds, bpm, noteLength, subdivision, strength);
  const end = quantiseTime(
    event.startSeconds + event.durationSeconds, bpm, noteLength, subdivision, strength,
  );
  const step = Math.max(0, Math.round(start / secondsPerStep));
  const durationSteps = Math.max(1, Math.round((end - start) / secondsPerStep));
  return { step, durationSteps };
}

export function percussionEventToStep(
  event: PercussionEvent,
  bpm: number,
  noteLength: number,
  strength = 1,
  subdivision: QuantisationSubdivision = 'sixteenth',
): number {
  const secondsPerStep = 60 / bpm * 4 / noteLength;
  const start = quantiseTime(event.startSeconds, bpm, noteLength, subdivision, strength);
  return Math.max(0, Math.round(start / secondsPerStep));
}
