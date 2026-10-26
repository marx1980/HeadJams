import {
  arrangementLength, audibleChannels, channelsForPlaybackStep, totalSteps, type Project,
} from '../model/project';
import { findSound, renderPitchedNote, renderSound, SAMPLE_RATE } from '../library/sounds';
import { resampleSample, type SampleData } from '../library/sampleStorage';
import { stepDuration } from './scheduler';
import { pitchToFrequency } from '../model/music';

export function panGains(volume: number, pan: number): [number, number] {
  return [volume * (pan > 0 ? 1 - pan : 1), volume * (pan < 0 ? 1 + pan : 1)];
}

/** Offline mixdown of one pass of the loop (plus a short tail) to stereo. */
export function renderProject(p: Project, sr = SAMPLE_RATE, samples: ReadonlyMap<string, SampleData> = new Map()): { left: Float32Array; right: Float32Array } {
  const stepLen = Math.round(stepDuration(p.bpm, p.noteLength) * sr);
  const songSteps = arrangementLength(p) || totalSteps(p);
  const loopLen = stepLen * songSteps;
  const left = new Float32Array(loopLen + sr);
  const right = new Float32Array(loopLen + sr);
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
  return { left, right };
}
