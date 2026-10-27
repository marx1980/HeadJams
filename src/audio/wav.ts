export interface WavOptions {
  bitDepth?: 16 | 24;
  normalize?: boolean;
}

/** Encode stereo float samples as a 16- or 24-bit PCM WAV file. */
export function encodeWav(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  options: WavOptions = {},
): ArrayBuffer {
  if (left.length !== right.length) throw new RangeError('Stereo channels must have equal sample counts.');
  if (!Number.isInteger(sampleRate) || sampleRate < 1 || sampleRate > 192000) {
    throw new RangeError('Sample rate must be between 1 and 192000 Hz.');
  }
  const bitDepth = options.bitDepth ?? 16;
  if (bitDepth !== 16 && bitDepth !== 24) throw new RangeError('WAV bit depth must be 16 or 24.');
  const n = left.length;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = bytesPerSample * 2;
  const dataSize = n * blockAlign;
  if (!Number.isSafeInteger(dataSize) || dataSize > 0xffffffff - 36) throw new RangeError('WAV data exceeds the RIFF format limit.');
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true); v.setUint16(34, bitDepth, true); str(36, 'data'); v.setUint32(40, dataSize, true);
  let peak = 0;
  if (options.normalize) {
    for (let i = 0; i < n; i++) {
      peak = Math.max(peak, Math.abs(Number.isFinite(left[i]) ? left[i] : 0), Math.abs(Number.isFinite(right[i]) ? right[i] : 0));
    }
  }
  const gain = options.normalize && peak > 0 ? 0.891250938 / peak : 1;
  const scale = 2 ** (bitDepth - 1) - 1;
  const pcm = (x: number) => Math.round(Math.max(-1, Math.min(1, (Number.isFinite(x) ? x : 0) * gain)) * scale);
  const writeSample = (offset: number, value: number) => {
    if (bitDepth === 16) {
      v.setInt16(offset, value, true);
      return;
    }
    const unsigned = value < 0 ? value + 0x1000000 : value;
    v.setUint8(offset, unsigned & 0xff);
    v.setUint8(offset + 1, (unsigned >>> 8) & 0xff);
    v.setUint8(offset + 2, (unsigned >>> 16) & 0xff);
  };
  for (let i = 0; i < n; i++) {
    const offset = 44 + i * blockAlign;
    writeSample(offset, pcm(left[i]));
    writeSample(offset + bytesPerSample, pcm(right[i]));
  }
  return buf;
}
