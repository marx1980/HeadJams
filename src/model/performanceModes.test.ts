import { describe, expect, it } from 'vitest';
import { recognizePitch } from '../library/pitchRecognition';
import { applyPerformanceMode, cleanGlides } from './performanceModes';
import { createRecognitionTake } from './recognitionProject';
import type { DetectedNoteEvent } from './recognition';

/** The hummed-style test phrase used by the browser check: C D E G E D C C with slight vibrato. */
function hummedPhrase(rate = 22050): Float32Array {
  const notes = [60, 62, 64, 67, 64, 62, 60, 60];
  const out: number[] = [];
  for (const midi of notes) {
    const f = 440 * 2 ** ((midi - 69) / 12);
    const n = Math.floor(rate * 0.45);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      phase += 2 * Math.PI * f * (1 + 0.004 * Math.sin(2 * Math.PI * 5 * t)) / rate;
      const env = Math.min(1, t / 0.03) * Math.min(1, (0.45 - t) / 0.06);
      out.push(0.5 * env * (Math.sin(phase) + 0.3 * Math.sin(2 * phase) + 0.1 * Math.sin(3 * phase)));
    }
    for (let i = 0; i < rate * 0.05; i++) out.push(0);
  }
  return Float32Array.from(out);
}

const note = (id: string, pitch: number, start: number, duration: number): DetectedNoteEvent => ({
  id, pitch, startSeconds: start, durationSeconds: duration, velocity: 0.8, confidence: 0.9,
});

describe('performance modes', () => {
  it('removes glide notes from a real recognition of the test phrase but keeps repeated notes', () => {
    const detected = recognizePitch(hummedPhrase(), 22050, 'melody');
    const cleaned = cleanGlides(detected).map((event) => (event as DetectedNoteEvent).pitch);
    expect(cleaned).toEqual([60, 62, 64, 67, 64, 62, 60, 60]);
  });

  it('keeps short notes that are not between their neighbours and gives a glide its time to the previous note', () => {
    const events = [note('a', 60, 0, 0.4), note('g', 72, 0.42, 0.1), note('b', 62, 0.54, 0.4)];
    expect(cleanGlides(events).map((e) => e.id)).toEqual(['a', 'g', 'b']);
    const glide = [note('a', 67, 0, 0.4), note('g', 65, 0.42, 0.08), note('b', 64, 0.52, 0.4)];
    const out = cleanGlides(glide);
    expect(out.map((e) => e.id)).toEqual(['a', 'b']);
    expect((out[0] as DetectedNoteEvent).durationSeconds).toBeCloseTo(0.5);
  });

  it('derives every mode from the original detection, so switching back is lossless', () => {
    const detected = recognizePitch(hummedPhrase(), 22050, 'melody');
    const take = createRecognitionTake('s', { mode: 'melody', modelId: 'm', modelVersion: '1', events: detected, tempoAlternatives: [] },
      { enabled: false, strength: 0, subdivision: 'sixteenth' }, 120, 16, 't');
    const tight = applyPerformanceMode(take, 'tight', 120, 16, 0, 'major');
    const original = applyPerformanceMode(tight, 'original', 120, 16, 0, 'major');
    expect(tight.performance).toBe('tight');
    expect(tight.quantisedEvents.length).toBe(8);
    expect(tight.quantisedEvents.every((e) => Math.abs(e.startSeconds / 0.125 - Math.round(e.startSeconds / 0.125)) < 1e-6)).toBe(true);
    expect(original.quantisedEvents).toEqual(take.quantisedEvents);
    expect(original.originalEvents).toEqual(take.originalEvents);
  });
});
