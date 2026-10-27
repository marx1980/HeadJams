export interface SampleProcessingSettings {
  trimStart: number;
  trimEnd: number;
  normalize: boolean;
  gainDb: number;
  noiseReduction: number;
  gateThreshold: number;
  fadeIn: number;
  fadeOut: number;
  deClick: boolean;
  pitchSemitones: number;
  fineTuneCents: number;
  speed: number;
  stretch: number;
  reverse: boolean;
  fitBeats: number;
  targetBpm: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  highPass: number;
  compression: number;
  reverb: number;
  delay: number;
  distortion: number;
  chorus: number;
  loFi: number;
}

export const DEFAULT_SAMPLE_SETTINGS: SampleProcessingSettings = {
  trimStart: 0, trimEnd: 1, normalize: true, gainDb: 0, noiseReduction: 0,
  gateThreshold: 0, fadeIn: 0, fadeOut: 0, deClick: false,
  pitchSemitones: 0, fineTuneCents: 0, speed: 1, stretch: 1, reverse: false,
  fitBeats: 0, targetBpm: 120, eqLow: 0, eqMid: 0, eqHigh: 0, highPass: 0,
  compression: 0, reverb: 0, delay: 0, distortion: 0, chorus: 0, loFi: 0,
};

const bounded = (value: number | undefined, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value!)) : fallback;

export function normalizeSampleSettings(settings?: Partial<SampleProcessingSettings> | null): SampleProcessingSettings {
  const defaults = DEFAULT_SAMPLE_SETTINGS;
  return {
    trimStart: bounded(settings?.trimStart, defaults.trimStart, 0, 0.999),
    trimEnd: bounded(settings?.trimEnd, defaults.trimEnd, 0.001, 1),
    normalize: typeof settings?.normalize === 'boolean' ? settings.normalize : defaults.normalize,
    gainDb: bounded(settings?.gainDb, defaults.gainDb, -36, 12),
    noiseReduction: bounded(settings?.noiseReduction, defaults.noiseReduction, 0, 1),
    gateThreshold: bounded(settings?.gateThreshold, defaults.gateThreshold, 0, 1),
    fadeIn: bounded(settings?.fadeIn, defaults.fadeIn, 0, 10),
    fadeOut: bounded(settings?.fadeOut, defaults.fadeOut, 0, 10),
    deClick: typeof settings?.deClick === 'boolean' ? settings.deClick : defaults.deClick,
    pitchSemitones: bounded(settings?.pitchSemitones, defaults.pitchSemitones, -24, 24),
    fineTuneCents: bounded(settings?.fineTuneCents, defaults.fineTuneCents, -100, 100),
    speed: bounded(settings?.speed, defaults.speed, 0.25, 4),
    stretch: bounded(settings?.stretch, defaults.stretch, 0.25, 4),
    reverse: typeof settings?.reverse === 'boolean' ? settings.reverse : defaults.reverse,
    fitBeats: bounded(settings?.fitBeats, defaults.fitBeats, 0, 16),
    targetBpm: bounded(settings?.targetBpm, defaults.targetBpm, 40, 240),
    eqLow: bounded(settings?.eqLow, defaults.eqLow, -12, 12),
    eqMid: bounded(settings?.eqMid, defaults.eqMid, -12, 12),
    eqHigh: bounded(settings?.eqHigh, defaults.eqHigh, -12, 12),
    highPass: bounded(settings?.highPass, defaults.highPass, 0, 1000),
    compression: bounded(settings?.compression, defaults.compression, 0, 2),
    reverb: bounded(settings?.reverb, defaults.reverb, 0, 1),
    delay: bounded(settings?.delay, defaults.delay, 0, 1),
    distortion: bounded(settings?.distortion, defaults.distortion, 0, 1),
    chorus: bounded(settings?.chorus, defaults.chorus, 0, 1),
    loFi: bounded(settings?.loFi, defaults.loFi, 0, 1),
  };
}

function resampleRate(input: Float32Array, rate: number): Float32Array {
  if (!input.length || rate === 1) return input;
  const output = new Float32Array(Math.max(1, Math.round(input.length / rate)));
  for (let i = 0; i < output.length; i++) {
    const position = i * rate;
    const left = Math.min(input.length - 1, Math.floor(position));
    const right = Math.min(input.length - 1, left + 1);
    const mix = position - left;
    output[i] = input[left] * (1 - mix) + input[right] * mix;
  }
  return output;
}

function stretch(input: Float32Array, factor: number): Float32Array {
  if (!input.length || Math.abs(factor - 1) < 0.001) return input;
  const output = new Float32Array(Math.max(1, Math.round(input.length * factor)));
  const weights = new Float32Array(output.length);
  const frame = Math.min(1024, Math.max(128, 2 ** Math.floor(Math.log2(input.length))));
  const hop = Math.max(32, Math.floor(frame / 4));
  for (let outStart = 0; outStart < output.length; outStart += hop) {
    const inStart = Math.floor(outStart / factor);
    for (let i = 0; i < frame && outStart + i < output.length && inStart + i < input.length; i++) {
      const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / frame);
      output[outStart + i] += input[inStart + i] * window;
      weights[outStart + i] += window;
    }
  }
  for (let i = 0; i < output.length; i++) if (weights[i] > 0) output[i] /= weights[i];
  return output;
}

interface Biquad {
  b0: number; b1: number; b2: number; a0: number; a1: number; a2: number;
}

function biquad(input: Float32Array, c: Biquad): Float32Array {
  const output = new Float32Array(input.length);
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    output[i] = (c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2) / c.a0;
    x2 = x1; x1 = x0; y2 = y1; y1 = output[i];
  }
  return output;
}

function peak(input: Float32Array, sampleRate: number, frequency: number, gainDb: number): Float32Array {
  const a = 10 ** (gainDb / 40);
  const omega = 2 * Math.PI * Math.min(frequency, sampleRate * 0.45) / sampleRate;
  const alpha = Math.sin(omega) / 2;
  return biquad(input, {
    b0: 1 + alpha * a, b1: -2 * Math.cos(omega), b2: 1 - alpha * a,
    a0: 1 + alpha / a, a1: -2 * Math.cos(omega), a2: 1 - alpha / a,
  });
}

function lowpass(input: Float32Array, sampleRate: number, frequency: number): Float32Array {
  const omega = 2 * Math.PI * Math.min(frequency, sampleRate * 0.49) / sampleRate;
  const cosine = Math.cos(omega);
  const alpha = Math.sin(omega) / Math.SQRT2;
  return biquad(input, {
    b0: (1 - cosine) / 2, b1: 1 - cosine, b2: (1 - cosine) / 2,
    a0: 1 + alpha, a1: -2 * cosine, a2: 1 - alpha,
  });
}

function highpass(input: Float32Array, sampleRate: number, frequency: number): Float32Array {
  const omega = 2 * Math.PI * Math.min(frequency, sampleRate * 0.49) / sampleRate;
  const cosine = Math.cos(omega);
  const alpha = Math.sin(omega) / Math.SQRT2;
  return biquad(input, {
    b0: (1 + cosine) / 2, b1: -(1 + cosine), b2: (1 + cosine) / 2,
    a0: 1 + alpha, a1: -2 * cosine, a2: 1 - alpha,
  });
}

function suppressNoise(input: Float32Array, strength: number): Float32Array {
  if (!input.length || strength <= 0) return input;
  const block = 256;
  const levels: number[] = [];
  for (let start = 0; start < input.length; start += block) {
    let sum = 0;
    for (let i = start; i < Math.min(start + block, input.length); i++) sum += input[i] * input[i];
    levels.push(Math.sqrt(sum / Math.min(block, input.length - start)));
  }
  const sorted = [...levels].sort((a, b) => a - b);
  const floor = sorted[Math.floor((sorted.length - 1) * 0.2)] ?? 0;
  if (floor <= 1e-5) return input;
  const threshold = floor * (1 + strength * 2);
  const output = input.slice();
  for (let i = 0; i < output.length; i++) {
    const level = levels[Math.min(levels.length - 1, Math.floor(i / block))];
    const reduction = level >= threshold ? 1 : Math.max(0.12, level / threshold);
    output[i] *= 1 - strength * (1 - reduction);
  }
  return output;
}

function applyGate(input: Float32Array, threshold: number): Float32Array {
  if (!input.length || threshold <= 0) return input;
  const output = input.slice();
  const smooth = Math.max(1e-5, threshold * 0.12);
  for (let i = 0; i < output.length; i++) {
    const level = Math.abs(output[i]);
    output[i] *= Math.max(0, Math.min(1, (level - threshold) / smooth));
  }
  return output;
}

function estimateBpm(samples: Float32Array, sampleRate: number): number | undefined {
  const hop = Math.max(1, Math.floor(sampleRate / 100));
  const envelope = new Float32Array(Math.ceil(samples.length / hop));
  for (let frame = 0; frame < envelope.length; frame++) {
    let energy = 0;
    const end = Math.min(samples.length, (frame + 1) * hop);
    for (let i = frame * hop; i < end; i++) energy += samples[i] * samples[i];
    envelope[frame] = Math.sqrt(energy / Math.max(1, end - frame * hop));
  }
  const minLag = Math.floor(60 * 100 / 200);
  const maxLag = Math.floor(60 * 100 / 60);
  let bestLag = 0; let bestScore = -Infinity;
  for (let lag = minLag; lag <= Math.min(maxLag, envelope.length / 2); lag++) {
    let score = 0;
    for (let i = lag; i < envelope.length; i++) score += envelope[i] * envelope[i - lag];
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }
  if (!bestLag || !Number.isFinite(bestScore) || bestScore <= 0) return undefined;
  return Math.round(6000 / bestLag);
}

export function detectSampleBpm(samples: Float32Array, sampleRate: number): number | undefined {
  if (!samples.length || sampleRate <= 0) return undefined;
  return estimateBpm(samples, sampleRate);
}

export function detectSamplePitch(samples: Float32Array, sampleRate: number): number | undefined {
  if (samples.length < 64 || sampleRate <= 0) return undefined;
  const minLag = Math.max(2, Math.floor(sampleRate / 1000));
  const maxLag = Math.min(Math.floor(sampleRate / 55), Math.floor(samples.length / 2));
  const scores = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let difference = 0;
    let energy = 0;
    const limit = Math.min(samples.length - lag, sampleRate);
    for (let i = 0; i < limit; i++) {
      const current = samples[i];
      const next = samples[i + lag];
      difference += (current - next) ** 2;
      energy += current * current + next * next;
    }
    scores[lag] = energy > 0 ? 1 - difference / energy : 0;
  }
  let bestLag = 0;
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (scores[lag] > 0.6 && scores[lag] >= scores[lag - 1] && scores[lag] >= scores[lag + 1]) {
      bestLag = lag;
      break;
    }
  }
  if (!bestLag) return undefined;
  return Math.round(69 + 12 * Math.log2(sampleRate / bestLag / 440));
}

export function detectSampleTrim(samples: Float32Array, threshold = 0.015): [number, number] {
  if (!samples.length) return [0, 1];
  const edge = bounded(threshold, 0.015, 0, 1);
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  if (peak < edge) return [0, 1];
  let start = 0;
  let end = samples.length - 1;
  while (start < end && Math.abs(samples[start]) < edge) start++;
  while (end > start && Math.abs(samples[end]) < edge) end--;
  return [start / samples.length, Math.min(1, (end + 1) / samples.length)];
}

export function processSample(
  original: Float32Array,
  sampleRate: number,
  inputSettings?: Partial<SampleProcessingSettings>,
  projectBpm?: number,
): Float32Array {
  const settings = normalizeSampleSettings(inputSettings);
  if (!original.length || sampleRate <= 0) return new Float32Array();
  const start = Math.min(original.length - 1, Math.floor(settings.trimStart * original.length));
  const end = Math.max(start + 1, Math.min(original.length, Math.floor(settings.trimEnd * original.length)));
  let output: Float32Array<ArrayBufferLike> = original.slice(start, end);

  if (settings.deClick && output.length > 2) {
    const clean = output.slice();
    for (let i = 1; i < output.length - 1; i++) {
      const middle = output[i];
      const median = [output[i - 1], middle, output[i + 1]].sort((a, b) => a - b)[1];
      if (Math.abs(middle - median) > 0.65) clean[i] = median;
    }
    output = clean;
  }
  output = suppressNoise(output, settings.noiseReduction);
  output = applyGate(output, settings.gateThreshold);

  const automaticEdgeFade = settings.trimStart > 0 || settings.trimEnd < 1 ? 0.003 : 0;
  const fadeIn = Math.min(output.length, Math.round(Math.max(settings.fadeIn, automaticEdgeFade) * sampleRate));
  const fadeOut = Math.min(output.length, Math.round(Math.max(settings.fadeOut, automaticEdgeFade) * sampleRate));
  for (let i = 0; i < fadeIn; i++) output[i] *= fadeIn > 1 ? i / (fadeIn - 1) : 0;
  for (let i = 0; i < fadeOut; i++) {
    output[output.length - fadeOut + i] *= fadeOut > 1 ? (fadeOut - 1 - i) / (fadeOut - 1) : 0;
  }

  if (settings.reverse) output.reverse();
  if (settings.speed !== 1) output = resampleRate(output, settings.speed);
  if (settings.stretch !== 1) output = stretch(output, settings.stretch);
  const pitchRate = 2 ** ((settings.pitchSemitones + settings.fineTuneCents / 100) / 12);
  if (Math.abs(pitchRate - 1) > 0.001) output = stretch(resampleRate(output, pitchRate), pitchRate);
  if (settings.fitBeats > 0) {
    const targetBpm = inputSettings?.targetBpm === undefined ? projectBpm : settings.targetBpm;
    const beatLength = 60 / bounded(targetBpm, settings.targetBpm, 40, 240);
    output = stretch(output, (beatLength * settings.fitBeats * sampleRate) / output.length);
  }

  if (settings.highPass > 0) output = highpass(output, sampleRate, settings.highPass);
  if (settings.eqLow) output = peak(output, sampleRate, 180, settings.eqLow);
  if (settings.eqMid) output = peak(output, sampleRate, 1000, settings.eqMid);
  if (settings.eqHigh) output = peak(output, sampleRate, 5000, settings.eqHigh);
  if (settings.compression > 0) {
    const threshold = 10 ** (-settings.compression * 9 / 20);
    const ratio = 1 + settings.compression * 5;
    output = output.map((value) => {
      const magnitude = Math.abs(value);
      return Math.sign(value) * (magnitude <= threshold ? magnitude : threshold + (magnitude - threshold) / ratio);
    });
  }
  if (settings.distortion > 0) {
    const drive = 1 + settings.distortion * 12;
    const normalizer = Math.tanh(drive);
    output = output.map((value) => Math.tanh(value * drive) / normalizer);
  }
  if (settings.delay > 0) {
    const delayed = output.slice();
    const tap = Math.max(1, Math.floor(sampleRate * 0.25));
    for (let i = tap; i < output.length; i++) delayed[i] += output[i - tap] * settings.delay * 0.35;
    output = delayed;
  }
  if (settings.reverb > 0) {
    const source = output;
    output = source.slice();
    for (const seconds of [0.029, 0.041, 0.053, 0.071]) {
      const offset = Math.round(seconds * sampleRate);
      for (let i = offset; i < output.length; i++) output[i] += source[i - offset] * settings.reverb * 0.06;
    }
  }
  if (settings.chorus > 0) {
    const source = output;
    output = source.slice();
    const baseDelay = Math.max(1, Math.round(sampleRate * 0.018));
    for (let i = baseDelay; i < output.length; i++) {
      const modulation = Math.round(Math.sin(i / sampleRate * 2 * Math.PI * 0.7) * sampleRate * 0.004 * settings.chorus);
      const index = i - Math.max(1, baseDelay + modulation);
      if (index >= 0) output[i] += source[index] * settings.chorus * 0.25;
    }
  }
  if (settings.loFi > 0) {
    const hold = Math.max(1, Math.round(1 + settings.loFi * 23));
    const bits = Math.max(4, Math.round(16 - settings.loFi * 12));
    const step = 2 / 2 ** bits;
    for (let i = 0; i < output.length; i++) {
      if (i % hold) output[i] = output[i - (i % hold)];
      output[i] = Math.round(output[i] / step) * step;
    }
  }
  let max = 0;
  for (const value of output) max = Math.max(max, Math.abs(value));
  if (settings.normalize && max > 0) {
    const scale = 0.98 / max;
    for (let i = 0; i < output.length; i++) output[i] *= scale;
  }
  const gain = 10 ** (settings.gainDb / 20);
  for (let i = 0; i < output.length; i++) output[i] = Math.max(-1, Math.min(1, output[i] * gain));
  return output;
}
