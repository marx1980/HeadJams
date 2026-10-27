import { describe, expect, it } from 'vitest';
import { detectOnsets } from './beatboxRecognition';
import { localRecognitionAdapter } from './recognitionAdapter';
import { recognizePitch } from './pitchRecognition';
import { noteEventToSteps, quantiseRecognitionEvents } from './quantisation';
import { detectTempo } from './tempoDetection';

function tone(
  frequency: number, seconds: number, sampleRate = 11025, startSeconds = 0, amplitude = 0.35,
): Float32Array {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  const start = Math.round(startSeconds * sampleRate);
  for (let index = start; index < samples.length; index++) {
    samples[index] = amplitude * Math.sin(2 * Math.PI * frequency * (index - start) / sampleRate);
  }
  return samples;
}

describe('local recognition', () => {
  it('segments a monophonic melody and tracks low bass pitches', () => {
    const melody = tone(440, 0.7, 11025, 0.1);
    const note = recognizePitch(melody, 11025, 'melody')[0];
    expect(note?.pitch).toBe(69);
    expect(note?.startSeconds).toBeGreaterThanOrEqual(0.05);
    expect(note?.durationSeconds).toBeGreaterThan(0.4);
    expect(note?.confidence).toBeGreaterThan(0.5);

    const bass = recognizePitch(tone(110, 0.7), 11025, 'bass')[0];
    expect(bass?.pitch).toBe(45);
  });

  it('does not delay a quiet note because the previous note was louder', () => {
    const sampleRate = 11025;
    const samples = new Float32Array(sampleRate);
    for (const [frequency, start, end, amplitude] of [[440, 0.1, 0.4, 0.35], [523.25, 0.65, 0.95, 0.015]]) {
      for (let index = Math.round(start * sampleRate); index < Math.round(end * sampleRate); index++) {
        samples[index] = amplitude * Math.sin(2 * Math.PI * frequency * (index - Math.round(start * sampleRate)) / sampleRate);
      }
    }
    const quietNote = recognizePitch(samples, sampleRate).find((event) => event.pitch === 72);
    expect(quietNote).toBeDefined();
    expect(quietNote!.startSeconds).toBeGreaterThan(0.6);
    expect(quietNote!.startSeconds).toBeLessThan(0.75);
  });

  it('detects percussion attacks, estimates tempo and leaves empty audio empty', () => {
    const sampleRate = 11025;
    const samples = new Float32Array(sampleRate * 2);
    for (const second of [0.1, 0.6, 1.1, 1.6]) {
      const start = Math.round(second * sampleRate);
      for (let offset = 0; offset < 500; offset++) {
        samples[start + offset] = 0.7 * Math.sin(2 * Math.PI * 120 * offset / sampleRate)
          * (1 - offset / 500);
      }
    }
    const events = detectOnsets(samples, sampleRate);
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events[0].startSeconds).toBeCloseTo(0.1, 1);
    expect(detectOnsets(new Float32Array(500), sampleRate)).toEqual([]);
    expect(detectTempo(samples, sampleRate, events).bpm).toBe(120);
  });

  it('quantises timing by adjustable strength and converts note duration to project steps', () => {
    const events = [{
      id: 'note-1', pitch: 60, startSeconds: 0.14, durationSeconds: 0.48,
      velocity: 0.8, confidence: 0.6,
    }];
    const light = quantiseRecognitionEvents(events, 120, 16, 'sixteenth', 0.25);
    const strong = quantiseRecognitionEvents(events, 120, 16, 'sixteenth', 1);
    expect(light[0].startSeconds).toBeGreaterThan(0);
    expect(strong[0].startSeconds).toBeCloseTo(0.125);
    expect(strong[0].confidence).toBe(0.6);
    expect(noteEventToSteps(strong[0], 120, 16)).toEqual({ step: 1, durationSteps: 4 });
  });

  it('uses a replaceable local adapter and supports cancellation', async () => {
    const result = await localRecognitionAdapter.recognize(tone(440, 0.5), 11025, 'melody');
    expect(result.modelId).toBe('local-yin-pitch-tracker');
    expect(result.events).toHaveLength(1);

    const controller = new AbortController();
    controller.abort();
    await expect(localRecognitionAdapter.recognize(tone(440, 0.5), 11025, 'melody', {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
