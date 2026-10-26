import { audibleChannels, totalSteps, type Project } from '../model/project';
import { findSound, renderSound, SAMPLE_RATE } from '../library/sounds';
import type { SampleData } from '../library/sampleStorage';
import { stepDuration } from './scheduler';

export function panGains(volume: number, pan: number): [number, number] {
  return [volume * (pan > 0 ? 1 - pan : 1), volume * (pan < 0 ? 1 + pan : 1)];
}

/** Offline mixdown of one pass of the loop (plus a short tail) to stereo. */
export function renderProject(p: Project, sr = SAMPLE_RATE, samples: ReadonlyMap<string, SampleData> = new Map()): { left: Float32Array; right: Float32Array } {
  const stepLen = Math.round(stepDuration(p.bpm, p.noteLength) * sr);
  const loopLen = stepLen * totalSteps(p);
  const left = new Float32Array(loopLen + sr);
  const right = new Float32Array(loopLen + sr);
  const cache = new Map<string, Float32Array>();
  for (const c of audibleChannels(p)) {
    const def = findSound(p, c.soundId);
    if (!def) continue;
    let data = cache.get(def.id);
    if (!data) {
      const sample = def.sampleId ? samples.get(def.sampleId) : undefined;
      data = sample ? resample(sample.samples, sample.sampleRate, sr) : def.sampleId ? new Float32Array() : renderSound(def.params, sr);
      cache.set(def.id, data);
    }
    const [gl, gr] = panGains(c.volume, c.pan);
    c.steps.forEach((on, i) => {
      if (!on) return;
      const start = i * stepLen;
      for (let k = 0; k < data!.length && start + k < left.length; k++) {
        left[start + k] += data![k] * gl;
        right[start + k] += data![k] * gr;
      }

      function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
        if (!input.length || fromRate <= 0 || fromRate === toRate) return input;
        const output = new Float32Array(Math.max(1, Math.round(input.length * toRate / fromRate)));
        for (let i = 0; i < output.length; i++) {
          const position = i * fromRate / toRate;
          const left = Math.min(input.length - 1, Math.floor(position));
          const right = Math.min(input.length - 1, left + 1);
          const mix = position - left;
          output[i] = input[left] * (1 - mix) + input[right] * mix;
        }
        return output;
      }
    });
  }
  return { left, right };
}
