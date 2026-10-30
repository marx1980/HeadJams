import { describe, expect, it } from 'vitest';
import { guessCaptureKind } from './captureGuess';

const rate = 22050;
function tones(midis: number[], seconds = 0.4): Float32Array {
  const out: number[] = [];
  for (const midi of midis) {
    const f = 440 * 2 ** ((midi - 69) / 12);
    for (let i = 0; i < rate * seconds; i++) {
      const t = i / rate;
      out.push(0.5 * Math.min(1, t / 0.02) * Math.min(1, (seconds - t) / 0.04) * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)));
    }
    for (let i = 0; i < rate * 0.05; i++) out.push(0);
  }
  return Float32Array.from(out);
}
function clicks(count: number): Float32Array {
  const out = new Float32Array(Math.round(rate * 0.25 * count));
  let seed = 7;
  for (let k = 0; k < count; k++) {
    const start = Math.round(k * rate * 0.25);
    for (let i = 0; i < rate * 0.04; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      out[start + i] = (seed / 2 ** 31 - 1) * Math.exp(-i / (rate * 0.01));
    }
  }
  return out;
}

describe('guessCaptureKind', () => {
  it('guesses melody for sung pitches, bass for low ones and beat for noisy bursts', () => {
    expect(guessCaptureKind(tones([60, 62, 64, 67]), rate)).toBe('melody');
    expect(guessCaptureKind(tones([40, 43, 45, 40]), rate)).toBe('bass');
    expect(guessCaptureKind(clicks(8), rate)).toBe('beat');
  });
});
