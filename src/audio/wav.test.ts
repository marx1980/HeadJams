import { describe, expect, it } from 'vitest';
import { encodeWav } from './wav';

describe('WAV encoding', () => {
  it.each([44100, 48000, 96000])('writes the sample rate and stereo layout at %i Hz', (sampleRate) => {
    const wav = encodeWav(new Float32Array([0.5]), new Float32Array([-0.5]), sampleRate);
    const view = new DataView(wav);

    expect(view.getUint32(24, true)).toBe(sampleRate);
    expect(view.getUint32(28, true)).toBe(sampleRate * 4);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(4);
  });

  it.each([16, 24] as const)('writes %i-bit PCM samples', (bitDepth) => {
    const wav = encodeWav(new Float32Array([0.5]), new Float32Array([-0.5]), 44100, { bitDepth });
    const view = new DataView(wav);
    const bytesPerSample = bitDepth / 8;

    expect(view.getUint16(34, true)).toBe(bitDepth);
    expect(view.getUint32(40, true)).toBe(bytesPerSample * 2);
    expect(wav.byteLength).toBe(44 + bytesPerSample * 2);
  });

  it('normalizes the stereo peak below full scale', () => {
    const wav = encodeWav(new Float32Array([0.5]), new Float32Array([-1]), 44100, { normalize: true });
    const view = new DataView(wav);

    expect(view.getInt16(44, true)).toBe(Math.round(0.5 * 0.891250938 * 32767));
    expect(view.getInt16(46, true)).toBe(-Math.round(0.891250938 * 32767));
  });

  it('rejects mismatched channels and invalid options', () => {
    expect(() => encodeWav(new Float32Array(1), new Float32Array(0), 44100)).toThrow(RangeError);
    expect(() => encodeWav(new Float32Array(0), new Float32Array(0), 44100, { bitDepth: 32 as 16 })).toThrow(RangeError);
    expect(() => encodeWav(new Float32Array(0), new Float32Array(0), 0)).toThrow(RangeError);
  });
});
