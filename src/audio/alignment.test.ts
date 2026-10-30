import { describe, expect, it } from 'vitest';
import { alignEvents, recordingOffsetSeconds } from './alignment';
import { createRecognitionTake } from '../model/recognitionProject';

describe('recording alignment', () => {
  const base = { beatZeroAudibleMs: 1000, recorderStartMs: 1000, inputLatencySec: 0, userOffsetMs: 0, loopSeconds: 2 };

  it('places a recording that starts on the audible downbeat at time zero', () => {
    expect(recordingOffsetSeconds(base)).toBe(0);
  });

  it('accounts for the recorder starting late, input latency and the manual offset', () => {
    expect(recordingOffsetSeconds({ ...base, recorderStartMs: 1120 })).toBeCloseTo(0.12);
    expect(recordingOffsetSeconds({ ...base, recorderStartMs: 1120, inputLatencySec: 0.02 })).toBeCloseTo(0.1);
    expect(recordingOffsetSeconds({ ...base, recorderStartMs: 1120, userOffsetMs: 50 })).toBeCloseTo(0.07);
  });

  it('wraps to the nearest loop pass when recording starts while the loop is running', () => {
    expect(recordingOffsetSeconds({ ...base, recorderStartMs: 1000 + 2000 * 5 + 300 })).toBeCloseTo(0.3);
    expect(recordingOffsetSeconds({ ...base, recorderStartMs: 1000 + 2000 * 3 - 40 })).toBeCloseTo(-0.04);
  });

  it('shifts events into project time and trims what falls before the start', () => {
    const events = [{ startSeconds: 0.01, durationSeconds: 0.2 }, { startSeconds: 0.5, durationSeconds: 0.2 }, { startSeconds: 0.0, durationSeconds: 0.03 }];
    expect(alignEvents(events, 0.1).map((e) => e.startSeconds)).toEqual([0.11, 0.6, 0.1]);
    const early = alignEvents(events, -0.05);
    expect(early).toHaveLength(2);
    expect(early[0]).toMatchObject({ startSeconds: 0 });
    expect(early[0].durationSeconds).toBeCloseTo(0.16);
  });

  it('applies the recording offset when a take is created and records it', () => {
    const take = createRecognitionTake('s', {
      mode: 'melody', modelId: 'm', modelVersion: '1', tempoAlternatives: [],
      events: [{ id: 'a', pitch: 60, startSeconds: 0.2, durationSeconds: 0.3, velocity: 1, confidence: 1 }],
    }, { enabled: false, strength: 0, subdivision: 'sixteenth' }, 120, 16, 't', 0, false, 0, 'major', 0.25);
    expect(take.alignmentSeconds).toBe(0.25);
    expect(take.originalEvents[0].startSeconds).toBeCloseTo(0.45);
    expect(take.quantisedEvents[0].startSeconds).toBeCloseTo(0.45);
  });
});
