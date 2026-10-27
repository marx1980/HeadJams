import type { PercussionClass, PercussionEvent } from '../model/recognition';

interface AnalysisFrame {
  start: number;
  rms: number;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function analyseSpectrum(samples: Float32Array, sampleRate: number, start: number): {
  centroid: number;
  zeroCrossingRate: number;
  rms: number;
  duration: number;
} {
  const length = Math.min(512, samples.length - start);
  if (length < 8) return { centroid: 0, zeroCrossingRate: 0, rms: 0, duration: 0 };
  const spectrumBins = 32;
  let magnitudeSum = 0;
  let weightedFrequency = 0;
  let crossings = 0;
  let energy = 0;
  let previous = samples[start];
  for (let index = 0; index < length; index++) {
    const value = samples[start + index];
    energy += value * value;
    if ((value < 0) !== (previous < 0)) crossings++;
    previous = value;
  }
  for (let bin = 1; bin <= spectrumBins; bin++) {
    const frequency = bin * sampleRate / (2 * spectrumBins);
    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < length; index++) {
      const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * index / length);
      const angle = 2 * Math.PI * bin * index / length;
      const value = samples[start + index] * window;
      real += value * Math.cos(angle);
      imaginary -= value * Math.sin(angle);
    }
    const magnitude = Math.hypot(real, imaginary);
    magnitudeSum += magnitude;
    weightedFrequency += magnitude * frequency;
  }
  return {
    centroid: magnitudeSum ? weightedFrequency / magnitudeSum : 0,
    zeroCrossingRate: crossings / length,
    rms: Math.sqrt(energy / length),
    duration: length / sampleRate,
  };
}

function classify(samples: Float32Array, sampleRate: number, start: number): {
  type: PercussionClass;
  confidence: number;
  velocity: number;
} {
  const features = analyseSpectrum(samples, sampleRate, start);
  const max = samples.length ? Math.max(...samples.subarray(start, Math.min(samples.length, start + 512)).map(Math.abs)) : 0;
  if (!features.rms || max < 0.005) return { type: 'unknown', confidence: 0.1, velocity: 0.05 };

  let type: PercussionClass;
  let confidence: number;
  if (features.centroid < 450) {
    type = features.duration > 0.03 && features.zeroCrossingRate < 0.035 ? 'kick' : 'bass';
    confidence = type === 'kick' ? 0.7 : 0.48;
  } else if (features.centroid > 3800) {
    type = features.duration > 0.035 && features.zeroCrossingRate > 0.16 ? 'open-hat' : 'closed-hat';
    confidence = 0.58;
    if (features.centroid > 6500) {
      type = 'cymbal';
      confidence = 0.66;
    }
  } else if (features.centroid > 1600 && features.zeroCrossingRate > 0.12) {
    type = 'clap';
    confidence = 0.62;
  } else if (features.centroid > 700 && features.zeroCrossingRate > 0.07) {
    type = 'snare';
    confidence = 0.63;
  } else if (features.centroid <= 1600) {
    type = 'tom';
    confidence = 0.5;
  } else {
    type = 'unknown';
    confidence = 0.35;
  }
  return {
    type,
    confidence,
    velocity: Math.max(0.05, Math.min(1, features.rms / 0.35)),
  };
}

export function detectOnsets(samples: Float32Array, sampleRate: number, sensitivity = 0.5): PercussionEvent[] {
  if (sampleRate <= 0 || samples.length < 8) return [];
  const frameSize = Math.max(1, Math.floor(sampleRate * 0.01));
  const frames: AnalysisFrame[] = [];
  for (let start = 0; start < samples.length; start += frameSize) {
    let energy = 0;
    const end = Math.min(samples.length, start + frameSize);
    for (let index = start; index < end; index++) energy += samples[index] * samples[index];
    frames.push({ start, rms: Math.sqrt(energy / (end - start)) });
  }
  const peak = Math.max(0, ...frames.map((frame) => frame.rms));
  if (peak < 0.005) return [];
  const floor = median(frames.map((frame) => frame.rms));
  const threshold = Math.max(0.006, peak * (0.09 - Math.max(0, Math.min(1, sensitivity)) * 0.055), floor * 2.2);
  const events: PercussionEvent[] = [];
  let lastOnset = -Infinity;
  for (let index = 1; index < frames.length - 1; index++) {
    const current = frames[index];
    const previous = frames[index - 1];
    const next = frames[index + 1];
    const rising = current.rms - previous.rms;
    const localPeak = current.rms >= next.rms;
    if (current.rms < threshold || rising < peak * 0.012 || !localPeak) continue;
    const onsetSeconds = current.start / sampleRate;
    if (onsetSeconds - lastOnset < 0.075) continue;
    const onset = classify(samples, sampleRate, current.start);
    if (onset.confidence < 0.4) onset.type = 'unknown';
    events.push({
      id: `percussion-${events.length + 1}`,
      type: onset.type,
      startSeconds: onsetSeconds,
      velocity: onset.velocity,
      confidence: onset.confidence,
    });
    lastOnset = onsetSeconds;
  }
  return events;
}
