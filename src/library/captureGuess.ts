import type { RecognitionMode } from '../model/recognition';
import { recognizePitch } from './pitchRecognition';

/**
 * Best guess of what a capture is, to pre-select Melody / Bass / Beat. The user confirms with one tap.
 * Sung or hummed material is mostly steady pitch; beatboxing and tapping are mostly unpitched bursts.
 */
export function guessCaptureKind(samples: Float32Array, sampleRate: number): RecognitionMode {
  if (!samples.length || sampleRate <= 0) return 'melody';
  const frame = Math.max(1, Math.round(sampleRate * 0.02));
  let peak = 0;
  const levels: number[] = [];
  for (let start = 0; start + frame <= samples.length; start += frame) {
    let sum = 0;
    for (let i = start; i < start + frame; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / frame);
    levels.push(rms);
    peak = Math.max(peak, rms);
  }
  const activeSeconds = levels.filter((rms) => rms > peak * 0.1).length * frame / sampleRate;
  if (activeSeconds <= 0) return 'melody';
  const notes = recognizePitch(samples, sampleRate, 'melody');
  const voicedSeconds = notes.reduce((sum, note) => sum + note.durationSeconds, 0);
  if (voicedSeconds / activeSeconds < 0.45) return 'beat';
  const pitches = notes.flatMap((note) => Array(Math.max(1, Math.round(note.durationSeconds * 20))).fill(note.pitch) as number[]).sort((a, b) => a - b);
  const median = pitches[Math.floor(pitches.length / 2)] ?? 60;
  return median < 52 ? 'bass' : 'melody';
}
