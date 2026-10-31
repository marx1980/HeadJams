/**
 * Per-track room (a reverb send), shared by live playback (a ConvolverNode) and WAV export (FFT convolution)
 * so both use the same impulse response. The response is deterministic: early reflections, then a
 * decaying sparse ("velvet") noise tail, slightly different left and right for width, normalised to unit energy.
 */

/** Room length in seconds and its decay (RT60). */
const ROOM_SEC = 0.9;
const RT60 = 0.75;
/** Send level at Room 100%. */
export const ROOM_SEND = 0.55;

const impulses = new Map<number, [Float32Array, Float32Array]>();

export function roomImpulse(sampleRate: number): [Float32Array, Float32Array] {
  const cached = impulses.get(sampleRate);
  if (cached) return cached;
  const length = Math.round(ROOM_SEC * sampleRate);
  const channels: [Float32Array, Float32Array] = [new Float32Array(length), new Float32Array(length)];
  let seed = 0x2545f491;
  const random = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const early = [[0.011, 0.6], [0.017, -0.45], [0.023, 0.4], [0.031, -0.35], [0.043, 0.3], [0.052, -0.25]];
  channels.forEach((data, side) => {
    for (const [time, gain] of early) {
      const index = Math.round((time + side * 0.0017) * sampleRate);
      if (index < length) data[index] += gain;
    }
    // Velvet noise: one ±1 impulse per ~0.7 ms, fading in over 30 ms and decaying by 60 dB over RT60.
    const spacing = Math.max(1, Math.round(sampleRate * 0.0007));
    for (let start = Math.round(0.02 * sampleRate); start < length; start += spacing) {
      const index = start + Math.floor(random() * spacing);
      if (index >= length) break;
      const time = index / sampleRate;
      const fade = Math.min(1, (time - 0.02) / 0.03);
      data[index] += (random() < 0.5 ? -1 : 1) * 0.5 * fade * 10 ** ((-3 * time) / RT60);
    }
    // A gentle one-pole low-pass, so the tail is darker than the direct sound.
    let low = 0;
    for (let i = 0; i < length; i++) {
      low += 0.45 * (data[i] - low);
      data[i] = low;
    }
  });
  let energy = 0;
  for (const data of channels) for (const value of data) energy += value * value;
  const scale = 1 / Math.sqrt(energy / 2);
  for (const data of channels) for (let i = 0; i < length; i++) data[i] *= scale;
  impulses.set(sampleRate, channels);
  return channels;
}

/** In-place iterative radix-2 FFT (inverse when `inverse`), on separate real and imaginary arrays. */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / size;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < size / 2; k++) {
        const a = start + k;
        const b = a + size / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/**
 * Convolve a mono send with the room's stereo response (overlap-add FFT) and add it into `left`/`right`.
 * The send is the mono sum of what the tracks routed to the room.
 */
export function addRoom(send: Float32Array, left: Float32Array, right: Float32Array, sampleRate: number): void {
  const irs = roomImpulse(sampleRate);
  const irLength = irs[0].length;
  const block = 16384;
  let size = 1;
  while (size < block + irLength - 1) size <<= 1;
  const spectra = irs.map((ir) => {
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    re.set(ir);
    fft(re, im, false);
    return { re, im };
  });
  for (let start = 0; start < send.length; start += block) {
    const chunk = send.subarray(start, Math.min(send.length, start + block));
    if (!chunk.some((value) => value !== 0)) continue;
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    re.set(chunk);
    fft(re, im, false);
    [left, right].forEach((out, side) => {
      const ir = spectra[side];
      const pr = new Float64Array(size);
      const pi = new Float64Array(size);
      for (let i = 0; i < size; i++) {
        pr[i] = re[i] * ir.re[i] - im[i] * ir.im[i];
        pi[i] = re[i] * ir.im[i] + im[i] * ir.re[i];
      }
      fft(pr, pi, true);
      const end = Math.min(out.length, start + chunk.length + irLength - 1);
      for (let i = start; i < end; i++) out[i] += pr[i - start];
    });
  }
}
