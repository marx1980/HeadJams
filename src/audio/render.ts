import { audibleChannels, totalSteps, type Project } from '../model/project';
import { findSound, renderSound, SAMPLE_RATE } from '../library/sounds';
import { stepDuration } from './scheduler';
import type { SampleData } from '../library/sampleStorage';

export function panGains(volume: number, pan: number): [number, number] {
  return [volume * (pan > 0 ? 1 - pan : 1), volume * (pan < 0 ? 1 + pan : 1)];
}

/** Offline mixdown of one pass of the loop (plus a short tail) to stereo. */
export function renderProject(p: Project, sr = SAMPLE_RATE, samples = new Map<string, SampleData>()): { left: Float32Array; right: Float32Array } {
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
      if (def.sampleId) {
        const sample = samples.get(def.sampleId);
        if (!sample) continue;
        if (sample.sampleRate === sr) data = sample.samples;
        else {
          const length = Math.round(sample.samples.length * sr / sample.sampleRate);
          data = new Float32Array(length);
          for (let i = 0; i < length; i++) {
            const pos = i * sample.sampleRate / sr;
            const before = Math.floor(pos);
            const fraction = pos - before;
            data[i] = (sample.samples[before] ?? 0) * (1 - fraction) + (sample.samples[before + 1] ?? 0) * fraction;
          }
        }
      } else if (def.params) data = renderSound(def.params, sr);
      if (!data) continue;
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
    });
  }
  return { left, right };
}
