/** Aligning microphone recordings with the music that was playing (hum.md H0). */

export interface RecordingTiming {
  /** performance.now() when the project's step 0 was audible at the speakers/headphones. */
  beatZeroAudibleMs: number;
  /** performance.now() when the recorder started capturing. */
  recorderStartMs: number;
  /** Microphone input latency in seconds (0 when unknown). */
  inputLatencySec: number;
  /** Manual correction from Settings, in milliseconds (positive = recordings land earlier). */
  userOffsetMs: number;
  /** Length of one pass of the loop or song in seconds (0 = no wrapping). */
  loopSeconds: number;
}

/**
 * Musical time (seconds from step 0) of the recording's first sample. A sound the performer makes in time with
 * what they hear reaches the recording `inputLatency` later, and what they hear is the music `outputLatency` late,
 * which beatZeroAudibleMs already includes. The result is wrapped to the nearest loop pass, so recording while
 * the loop is already running still lines up.
 */
export function recordingOffsetSeconds(timing: RecordingTiming): number {
  const raw = (timing.recorderStartMs - timing.beatZeroAudibleMs) / 1000 - timing.inputLatencySec - timing.userOffsetMs / 1000;
  if (!Number.isFinite(raw)) return 0;
  if (!(timing.loopSeconds > 0)) return raw;
  return raw - timing.loopSeconds * Math.round(raw / timing.loopSeconds);
}

/** Shift events recorded at `startSeconds` (recording time) to project time; events that end before 0 are dropped. */
export function alignEvents<T extends { startSeconds: number; durationSeconds?: number }>(events: readonly T[], offsetSeconds: number): T[] {
  if (!offsetSeconds) return events.map((event) => ({ ...event }));
  return events.flatMap((event) => {
    const start = event.startSeconds + offsetSeconds;
    if (start >= 0) return [{ ...event, startSeconds: start }];
    if (event.durationSeconds === undefined) return start > -0.05 ? [{ ...event, startSeconds: 0 }] : [];
    const duration = event.durationSeconds + start;
    return duration >= 0.05 ? [{ ...event, startSeconds: 0, durationSeconds: duration }] : [];
  });
}
