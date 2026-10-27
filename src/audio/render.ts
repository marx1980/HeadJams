import {
  arrangementLength, audibleChannels, channelsForPlaybackStep, totalSteps, type Project,
} from '../model/project';
import { findSound, renderPitchedNote, renderSound, SAMPLE_RATE } from '../library/sounds';
import { resampleSample, type SampleData } from '../library/sampleStorage';
import { stepDuration } from './scheduler';
import { pitchToFrequency } from '../model/music';

interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a0: number;
  a1: number;
  a2: number;
}

function applyBiquad(input: Float32Array, coefficients: BiquadCoefficients): Float32Array {
  const { b0, b1, b2, a0, a1, a2 } = coefficients;
  const output = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    output[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return output;
}

function lowpassCoefficients(cutoff: number, sampleRate: number): BiquadCoefficients {
  const omega = 2 * Math.PI * Math.min(cutoff, sampleRate * 0.49) / sampleRate;
  const cosine = Math.cos(omega);
  const alpha = Math.sin(omega) / Math.SQRT2;
  return {
    b0: (1 - cosine) / 2,
    b1: 1 - cosine,
    b2: (1 - cosine) / 2,
    a0: 1 + alpha,
    a1: -2 * cosine,
    a2: 1 - alpha,
  };
}

function shelfCoefficients(frequency: number, gainDb: number, sampleRate: number, high: boolean): BiquadCoefficients {
  const a = 10 ** (gainDb / 40);
  const omega = 2 * Math.PI * frequency / sampleRate;
  const cosine = Math.cos(omega);
  const sine = Math.sin(omega);
  const alpha = sine / 2 * Math.SQRT2;
  const root = 2 * Math.sqrt(a) * alpha;
  if (high) {
    return {
      b0: a * ((a + 1) + (a - 1) * cosine + root),
      b1: -2 * a * ((a - 1) + (a + 1) * cosine),
      b2: a * ((a + 1) + (a - 1) * cosine - root),
      a0: (a + 1) - (a - 1) * cosine + root,
      a1: 2 * ((a - 1) - (a + 1) * cosine),
      a2: (a + 1) - (a - 1) * cosine - root,
    };
  }
  return {
    b0: a * ((a + 1) - (a - 1) * cosine + root),
    b1: 2 * a * ((a - 1) - (a + 1) * cosine),
    b2: a * ((a + 1) - (a - 1) * cosine - root),
    a0: (a + 1) + (a - 1) * cosine + root,
    a1: -2 * ((a - 1) + (a + 1) * cosine),
    a2: (a + 1) + (a - 1) * cosine - root,
  };
}

function peakCoefficients(frequency: number, gainDb: number, sampleRate: number): BiquadCoefficients {
  const a = 10 ** (gainDb / 40);
  const omega = 2 * Math.PI * frequency / sampleRate;
  const cosine = Math.cos(omega);
  const alpha = Math.sin(omega) / 2;
  return {
    b0: 1 + alpha * a,
    b1: -2 * cosine,
    b2: 1 - alpha * a,
    a0: 1 + alpha / a,
    a1: -2 * cosine,
    a2: 1 - alpha / a,
  };
}

function processEffects(input: Float32Array, effects: Project['effects'], sampleRate: number): Float32Array {
  let output = input;
  if (effects.filterCutoff < 20000) output = applyBiquad(output, lowpassCoefficients(effects.filterCutoff, sampleRate));
  if (effects.eqLow !== 0) output = applyBiquad(output, shelfCoefficients(250, effects.eqLow, sampleRate, false));
  if (effects.eqMid !== 0) output = applyBiquad(output, peakCoefficients(1000, effects.eqMid, sampleRate));
  if (effects.eqHigh !== 0) output = applyBiquad(output, shelfCoefficients(Math.min(6000, sampleRate * 0.4), effects.eqHigh, sampleRate, true));

  if (effects.delay > 0) {
    const delaySamples = Math.max(1, Math.round(sampleRate * 0.25));
    const feedback = effects.delay * 0.35;
    for (let i = delaySamples; i < output.length; i++) {
      output[i] += output[i - delaySamples] * feedback;
    }
  }
  if (effects.reverb > 0) {
    const taps = [0.029, 0.041, 0.053, 0.071, 0.097, 0.131, 0.173, 0.229];
    const source = output;
    output = new Float32Array(source.length);
    for (let i = 0; i < source.length; i++) {
      let value = source[i];
      for (let tap = 0; tap < taps.length; tap++) {
        const index = i - Math.round(taps[tap] * sampleRate);
        if (index >= 0) value += source[index] * effects.reverb * (0.18 / (tap + 1));
      }
      output[i] = value;
    }
  }
  return output;
}

export function panGains(volume: number, pan: number): [number, number] {
  return [volume * (pan > 0 ? 1 - pan : 1), volume * (pan < 0 ? 1 + pan : 1)];
}

/** Offline mixdown of one pass of the loop (plus a short tail) to stereo. */
export function renderProject(p: Project, sr = SAMPLE_RATE, samples: ReadonlyMap<string, SampleData> = new Map()): { left: Float32Array; right: Float32Array } {
  const stepLen = Math.round(stepDuration(p.bpm, p.noteLength) * sr);
  const songSteps = arrangementLength(p) || totalSteps(p);
  const loopLen = stepLen * songSteps;
  const tail = sr * (1 + (p.effects.delay > 0 ? 1.5 : 0) + (p.effects.reverb > 0 ? 0.5 : 0));
  const left = new Float32Array(loopLen + tail);
  const right = new Float32Array(loopLen + tail);
  const cache = new Map<string, Float32Array>();
  const mix = (data: Float32Array, start: number, gl: number, gr: number) => {
    for (let k = 0; k < data.length && start + k < left.length; k++) {
      left[start + k] += data[k] * gl;
      right[start + k] += data[k] * gr;
    }
  };
  const renderSampleNote = (sample: SampleData, baseFreq: number, pitch: number, duration: number, velocity = 1) => {
    if (!sample.samples.length || sample.sampleRate <= 0) return new Float32Array();
    const rate = Math.min(8, Math.max(0.125, pitchToFrequency(pitch) / Math.max(10, baseFreq)));
    const end = Math.max(0.01, duration);
    const attack = 0.008;
    const release = 0.03;
    const length = Math.min(
      Math.ceil((end + release) * sr),
      Math.ceil(sample.samples.length * sr / (sample.sampleRate * rate)),
    );
    const output = new Float32Array(length);
    const level = Number.isFinite(velocity) ? Math.max(0, Math.min(1, velocity)) : 1;
    for (let i = 0; i < length; i++) {
      const time = i / sr;
      const position = i * sample.sampleRate * rate / sr;
      const left = Math.min(sample.samples.length - 1, Math.floor(position));
      const right = Math.min(sample.samples.length - 1, left + 1);
      const mix = position - left;
      const value = sample.samples[left] * (1 - mix) + sample.samples[right] * mix;
      const envelope = time < attack
        ? time / attack
        : time <= end
          ? 1
          : Math.exp((-6 * (time - end)) / release);
      output[i] = value * envelope * level;
    }
    return output;
  };
  for (let step = 0; step < songSteps; step++) {
    const start = step * stepLen;
    for (const source of channelsForPlaybackStep(p, step)) {
      for (const c of audibleChannels({ ...p, channels: source.channels })) {
        const def = findSound(p, c.soundId);
        if (!def) continue;
        const [gl, gr] = panGains(c.volume, c.pan);
        if (c.steps[source.localStep]) {
          let data = cache.get(def.id);
          if (!data) {
            const sample = def.sampleId ? samples.get(def.sampleId) : undefined;
            data = sample ? resampleSample(sample.samples, sample.sampleRate, sr) : def.sampleId ? new Float32Array() : renderSound(def.params, sr);
            cache.set(def.id, data);
          }
          mix(data, start, gl, gr);
        }
        for (const note of c.notes ?? []) {
          if (note.step === source.localStep) {
            const duration = note.durationSteps * stepLen / sr;
            const sample = def.sampleId ? samples.get(def.sampleId) : undefined;
            if (sample) mix(renderSampleNote(sample, def.params.freq, note.pitch, duration, note.velocity), start, gl, gr);
            else if (!def.sampleId) mix(renderPitchedNote(def.params, note.pitch, duration, note.velocity, sr), start, gl, gr);
          }
        }
      }
    }
  }
  return {
    left: processEffects(left, p.effects, sr),
    right: processEffects(right, p.effects, sr),
  };
}
