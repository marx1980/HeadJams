import { resampleSample } from './sampleStorage';
import type { DetectedNoteEvent, RecognitionMode } from '../model/recognition';

interface PitchFrame {
  time: number;
  startSeconds: number;
  pitch: number;
  confidence: number;
  rms: number;
}

const ANALYSIS_RATE = 11025;
const FRAME_SIZE = 1024;
const HOP_SIZE = 256;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function detectFramePitch(
  frame: Float32Array,
  sampleRate: number,
  minFrequency: number,
  maxFrequency: number,
): { pitch: number; confidence: number; rms: number } | undefined {
  let energy = 0;
  for (const sample of frame) energy += sample * sample;
  const rms = Math.sqrt(energy / frame.length);
  if (rms < 0.004) return undefined;

  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const maxLag = Math.min(Math.floor(sampleRate / minFrequency), Math.floor(frame.length / 2));
  const difference = new Float64Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let index = 0; index < frame.length - lag; index++) {
      const delta = frame[index] - frame[index + lag];
      sum += delta * delta;
    }
    difference[lag] = sum;
  }

  let running = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    running += difference[lag];
    difference[lag] = running > 0 ? difference[lag] * lag / running : 1;
  }
  let selected = 0;
  let selectedScore = Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (difference[lag] < 0.18) {
      while (lag < maxLag && difference[lag + 1] < difference[lag]) lag++;
      selected = lag;
      selectedScore = difference[lag];
      break;
    }
    if (difference[lag] < selectedScore) {
      selected = lag;
      selectedScore = difference[lag];
    }
  }
  if (!selected || selectedScore > 0.45) return undefined;

  const left = difference[Math.max(minLag, selected - 1)];
  const center = difference[selected];
  const right = difference[Math.min(maxLag, selected + 1)];
  const denominator = left - 2 * center + right;
  const offset = Math.abs(denominator) > 1e-8 ? 0.5 * (left - right) / denominator : 0;
  const period = selected + Math.max(-0.5, Math.min(0.5, offset));
  const frequency = sampleRate / period;
  const midiPitch = 69 + 12 * Math.log2(frequency / 440);
  return Number.isFinite(midiPitch)
    ? { pitch: midiPitch, confidence: Math.max(0, Math.min(1, 1 - selectedScore)), rms }
    : undefined;
}

function makeEvents(frames: Array<PitchFrame | undefined>, frameDuration: number, peakRms: number): DetectedNoteEvent[] {
  const output: DetectedNoteEvent[] = [];
  let group: PitchFrame[] = [];
  const flush = () => {
    if (!group.length) return;
    const pitch = Math.round(median(group.map((frame) => frame.pitch)));
    const halfWindow = frameDuration / 2;
    const startSeconds = group[0].startSeconds;
    const endSeconds = group[group.length - 1].time + halfWindow;
    const durationSeconds = endSeconds - startSeconds;
    if (durationSeconds >= 0.065) {
      const pitchBend = group
        .filter((frame, index) => index % 3 === 0 && Math.abs(frame.pitch - pitch) >= 0.2)
        .map((frame) => ({ time: Math.max(0, frame.time - startSeconds), value: frame.pitch - pitch }));
      output.push({
        id: `note-${output.length + 1}`,
        pitch: Math.max(0, Math.min(127, pitch)),
        rawPitch: Math.max(0, Math.min(127, median(group.map((frame) => frame.pitch)))),
        startSeconds,
        durationSeconds,
        velocity: Math.max(0.05, Math.min(1, median(group.map((frame) => frame.rms)) / Math.max(peakRms, 0.01))),
        confidence: median(group.map((frame) => frame.confidence)),
        ...(pitchBend.length ? { pitchBend } : {}),
      });
    }
    group = [];
  };

  for (const frame of frames) {
    if (!frame) {
      flush();
      continue;
    }
    if (group.length && Math.abs(frame.pitch - median(group.map((item) => item.pitch))) > 0.8) flush();
    group.push(frame);
  }
  flush();
  return output;
}

function analyseFrames(
  analysis: Float32Array,
  analysisRate: number,
  mode: Extract<RecognitionMode, 'melody' | 'bass'>,
  rawFrames: Array<ReturnType<typeof detectFramePitch> | undefined>,
): DetectedNoteEvent[] {
  const peakRms = Math.max(0, ...rawFrames.flatMap((frame) => frame ? [frame.rms] : []));
  const threshold = Math.max(0.004, peakRms * 0.015);
  const frames = rawFrames.map((frame, index): PitchFrame | undefined => {
    if (!frame || frame.rms < threshold || frame.confidence < 0.35) return undefined;
    const frameStart = index * HOP_SIZE;
    const onsetThreshold = Math.max(0.0001, Math.min(peakRms * 0.08, frame.rms * 0.2));
    let onsetSample = frameStart;
    const frameEnd = Math.min(analysis.length, frameStart + FRAME_SIZE);
    while (onsetSample < frameEnd && Math.abs(analysis[onsetSample]) < onsetThreshold) onsetSample++;
    if (onsetSample === frameEnd) onsetSample = frameStart;
    return {
      ...frame,
      time: (frameStart + FRAME_SIZE / 2) / analysisRate,
      startSeconds: onsetSample / analysisRate,
    };
  });
  return makeEvents(frames, FRAME_SIZE / analysisRate, peakRms);
}

function prepareAnalysis(
  samples: Float32Array,
  sampleRate: number,
): { analysis: Float32Array; analysisRate: number } | undefined {
  if (sampleRate <= 0 || samples.length < 64 || !samples.some((value) => Number.isFinite(value) && value !== 0)) return undefined;
  const analysisRate = Math.min(ANALYSIS_RATE, sampleRate);
  const analysis = analysisRate === sampleRate ? samples : resampleSample(samples, sampleRate, analysisRate);
  return analysis.length < FRAME_SIZE ? undefined : { analysis, analysisRate };
}

export function recognizePitch(
  samples: Float32Array,
  sampleRate: number,
  mode: Extract<RecognitionMode, 'melody' | 'bass'> = 'melody',
): DetectedNoteEvent[] {
  const prepared = prepareAnalysis(samples, sampleRate);
  if (!prepared) return [];
  const { analysis, analysisRate } = prepared;
  const minFrequency = mode === 'bass' ? 32 : 70;
  const maxFrequency = mode === 'bass' ? 420 : 1200;
  const count = Math.floor((analysis.length - FRAME_SIZE) / HOP_SIZE) + 1;
  const rawFrames: Array<ReturnType<typeof detectFramePitch> | undefined> = [];
  for (let index = 0; index < count; index++) {
    const start = index * HOP_SIZE;
    const frame = analysis.subarray(start, start + FRAME_SIZE);
    const detected = detectFramePitch(frame, analysisRate, minFrequency, maxFrequency);
    rawFrames.push(detected);
  }
  return analyseFrames(analysis, analysisRate, mode, rawFrames);
}

export async function recognizePitchAsync(
  samples: Float32Array,
  sampleRate: number,
  mode: Extract<RecognitionMode, 'melody' | 'bass'>,
  signal?: AbortSignal,
  onProgress?: (progress: number) => void,
): Promise<DetectedNoteEvent[]> {
  const prepared = prepareAnalysis(samples, sampleRate);
  if (!prepared) return [];
  const { analysis, analysisRate } = prepared;
  const minFrequency = mode === 'bass' ? 32 : 70;
  const maxFrequency = mode === 'bass' ? 420 : 1200;
  const count = Math.floor((analysis.length - FRAME_SIZE) / HOP_SIZE) + 1;
  const rawFrames: Array<ReturnType<typeof detectFramePitch> | undefined> = [];
  for (let index = 0; index < count; index++) {
    if (signal?.aborted) throw new DOMException('Recognition cancelled.', 'AbortError');
    const start = index * HOP_SIZE;
    rawFrames.push(detectFramePitch(analysis.subarray(start, start + FRAME_SIZE), analysisRate, minFrequency, maxFrequency));
    if (index % 32 === 0) {
      onProgress?.(count ? index / count : 1);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  return analyseFrames(analysis, analysisRate, mode, rawFrames);
}
