import { stepDuration } from '../audio/scheduler';
import { applyRecognitionTake } from './recognitionProject';
import { totalSteps, type Project } from './project';
import type { RecognitionEvent } from './recognition';

/**
 * Ideas › Start (plan.md milestone B): move a captured idea earlier or later by grid steps, e.g. when the
 * first sung note should be on beat 1. The detection, its tracks and the play-what-I-sang recording move
 * together; notes pushed before the loop start wrap to its end (a pickup into bar 1). Grid edits are kept.
 */
export const MAX_START_SHIFT = 32;

function shiftEvents<T extends RecognitionEvent>(events: readonly T[], seconds: number, loopSeconds: number): T[] {
  return events.map((event) => {
    let start = event.startSeconds + seconds;
    if (start < 0 && loopSeconds > 0) start += loopSeconds * Math.ceil(-start / loopSeconds);
    return { ...event, startSeconds: Math.max(0, start) };
  });
}

export function shiftTakeStart(project: Project, takeId: string, steps: number): Project {
  const take = project.recognitionTakes.find((item) => item.id === takeId);
  if (!take || !take.channelIds.length || !Number.isInteger(steps) || !steps) return project;
  const total = (take.startShiftSteps ?? 0) + steps;
  if (Math.abs(total) > MAX_START_SHIFT) return project;
  const step = stepDuration(project.bpm, project.noteLength);
  const seconds = steps * step;
  const loopSeconds = totalSteps(project) * step;
  const moved = {
    ...take,
    originalEvents: shiftEvents(take.originalEvents, seconds, loopSeconds),
    quantisedEvents: shiftEvents(take.quantisedEvents, seconds, loopSeconds),
    alignmentSeconds: (take.alignmentSeconds ?? 0) + seconds,
    ...(total ? { startShiftSteps: total } : { startShiftSteps: undefined }),
  };
  return applyRecognitionTake(project, moved, project.bpm) ?? project;
}

/**
 * Capture over one bar (plan.md B2): the take was recorded against that bar looping on its own, so its events
 * are moved into the bar and only what starts inside it is kept (the first pass sung over the loop).
 */
export function confineTakeToBar<T extends { originalEvents: RecognitionEvent[]; quantisedEvents: RecognitionEvent[]; alignmentSeconds?: number }>(
  take: T, bar: number, barSeconds: number,
): T {
  const from = bar * barSeconds;
  const to = from + barSeconds;
  const move = (events: readonly RecognitionEvent[]) => events
    .map((event) => ({ ...event, startSeconds: event.startSeconds + from }))
    .filter((event) => event.startSeconds >= from - 1e-6 && event.startSeconds < to - 1e-6)
    .map((event) => 'durationSeconds' in event
      ? { ...event, durationSeconds: Math.min(event.durationSeconds, to - event.startSeconds) } : event);
  const originalEvents = move(take.originalEvents);
  const kept = new Set(originalEvents.map((event) => event.id));
  return {
    ...take,
    originalEvents,
    quantisedEvents: move(take.quantisedEvents).filter((event) => kept.has(event.id)),
    alignmentSeconds: (take.alignmentSeconds ?? 0) + from,
  };
}
