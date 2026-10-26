import { audibleChannels, totalSteps, type Project } from '../model/project';
import { findSound, renderSound, SAMPLE_RATE } from '../library/sounds';
import { stepDuration } from './scheduler';

export function panGains(volume: number, pan: number): [number, number] {
  return [volume * (pan > 0 ? 1 - pan : 1), volume * (pan < 0 ? 1 + pan : 1)];
}

/** Offline mixdown of one pass of the loop (plus a short tail) to stereo. */
export function renderProject(p: Project, sr = SAMPLE_RATE): { left: Float32Array; right: Float32Array } {
  const stepLen = Math.round(stepDuration(p.bpm, p.noteLength) * sr);
  const loopLen = stepLen * totalSteps(p);
  const left = new Float32Array(loopLen + sr);
  const right = new Float32Array(loopLen + sr);
  const cache = new Map<string, Float32Array>();
  for (const c of audibleChannels(p)) {
    const def = findSound(p, c.soundId);
    if (!def) continue;
    let data = cache.get(def.id);
    if (!data) cache.set(def.id, (data = renderSound(def.params, sr)));
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
