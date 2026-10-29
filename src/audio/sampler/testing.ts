/** Test helpers: load bundled instruments from disk without a browser (used only by unit tests). */
import { readFileSync } from 'node:fs';
import { InstrumentStore, type Budgets, BUDGETS } from './instrumentStore';
import type { DecodedRegion } from './sampledVoice';

export const PUBLIC_DIR = new URL('../../../app/public/', import.meta.url);

/** Decode 16-bit PCM WAV (any channel count) to mono. */
export function decodeWav16(bytes: ArrayBuffer): DecodedRegion {
  const view = new DataView(bytes);
  let offset = 12;
  let channels = 1;
  let sampleRate = 44100;
  while (offset + 8 <= view.byteLength) {
    const id = String.fromCharCode(...new Uint8Array(bytes, offset, 4));
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ') {
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
    }
    if (id === 'data') {
      const frames = size / 2 / channels;
      const data = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += view.getInt16(offset + 8 + (i * channels + c) * 2, true) / 32768;
        data[i] = sum / channels;
      }
      return { sampleRate, data };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('No data chunk');
}

export function diskStore(budgets: Budgets = BUDGETS, overrides: Partial<{ missing: string[] }> = {}): InstrumentStore {
  const read = (url: string) => {
    const path = url.replace(/^\/MusicMaker\//, '').replace(/\?.*$/, '');
    if (overrides.missing?.some((name) => path.endsWith(name))) throw new Error(`missing ${path}`);
    const bytes = readFileSync(new URL(decodeURIComponent(path), PUBLIC_DIR));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  };
  return new InstrumentStore({
    baseUrl: '/MusicMaker/',
    fetchJson: async (url) => JSON.parse(new TextDecoder().decode(read(url))) as unknown,
    fetchBytes: async (url) => read(url),
    decode: async (bytes) => decodeWav16(bytes),
  }, budgets);
}
