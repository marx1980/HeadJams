import { InstrumentStore } from './instrumentStore';
import type { DecodedRegion } from './sampledVoice';

const DECODE_RATE = 44100;

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response;
}

/** Decode compressed or WAV audio and downmix to one AudioBuffer channel. */
async function decode(bytes: ArrayBuffer): Promise<DecodedRegion> {
  const context = new OfflineAudioContext(1, 1, DECODE_RATE);
  const decoded = await context.decodeAudioData(bytes);
  let buffer = decoded;
  if (decoded.numberOfChannels > 1) {
    buffer = new AudioBuffer({ numberOfChannels: 1, length: decoded.length, sampleRate: decoded.sampleRate });
    const mono = buffer.getChannelData(0);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const data = decoded.getChannelData(channel);
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / decoded.numberOfChannels;
    }
  }
  return { sampleRate: buffer.sampleRate, data: buffer.getChannelData(0), buffer };
}

/** The app-wide instrument store. */
export const instrumentStore = new InstrumentStore({
  fetchJson: async (url) => (await fetchOk(url)).json() as Promise<unknown>,
  fetchBytes: async (url) => (await fetchOk(url)).arrayBuffer(),
  decode,
  baseUrl: import.meta.env.BASE_URL,
});
