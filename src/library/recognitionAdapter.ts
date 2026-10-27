import type { DetectedNoteEvent, PercussionEvent, RecognitionMode, RecognitionResult } from '../model/recognition';
import { detectOnsets } from './beatboxRecognition';
import { recognizePitchAsync } from './pitchRecognition';
import { detectTempo } from './tempoDetection';

export interface RecognitionProgress {
  progress: number;
  message: string;
}

export interface RecognitionAdapter {
  recognize(
    samples: Float32Array,
    sampleRate: number,
    mode: RecognitionMode,
    options?: { signal?: AbortSignal; onProgress?: (progress: RecognitionProgress) => void },
  ): Promise<RecognitionResult>;
}

export interface PitchRecognitionEngine {
  modelId: string;
  modelVersion: string;
  recognize(
    samples: Float32Array,
    sampleRate: number,
    mode: Extract<RecognitionMode, 'melody' | 'bass'>,
    options: { signal?: AbortSignal; onProgress?: (progress: number) => void },
  ): Promise<DetectedNoteEvent[]>;
}

export class LocalRecognitionAdapter implements RecognitionAdapter {
  constructor(private readonly pitchEngine?: PitchRecognitionEngine) {}

  async recognize(
    samples: Float32Array,
    sampleRate: number,
    mode: RecognitionMode,
    options: { signal?: AbortSignal; onProgress?: (progress: RecognitionProgress) => void } = {},
  ): Promise<RecognitionResult> {
    if (!samples.length || sampleRate <= 0) throw new Error('Choose a non-empty recording before recognition.');
    if (options.signal?.aborted) throw new DOMException('Recognition cancelled.', 'AbortError');
    options.onProgress?.({ progress: 0.1, message: 'Preparing audio locally…' });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (options.signal?.aborted) throw new DOMException('Recognition cancelled.', 'AbortError');

    options.onProgress?.({ progress: 0.35, message: mode === 'beat' ? 'Finding percussion onsets…' : 'Tracking pitch…' });
    const events = mode === 'beat'
      ? detectOnsets(samples, sampleRate)
      : await (this.pitchEngine
        ? this.pitchEngine.recognize(samples, sampleRate, mode, {
          signal: options.signal,
          onProgress: (progress) => options.onProgress?.({
            progress: 0.35 + progress * 0.4,
            message: `Tracking pitch… ${Math.round(progress * 100)}%`,
          }),
        })
        : recognizePitchAsync(samples, sampleRate, mode, options.signal, (progress) => {
          options.onProgress?.({
            progress: 0.35 + progress * 0.4,
            message: `Tracking pitch… ${Math.round(progress * 100)}%`,
          });
        }));
    if (options.signal?.aborted) throw new DOMException('Recognition cancelled.', 'AbortError');

    options.onProgress?.({ progress: 0.8, message: 'Estimating tempo…' });
    const percussion = mode === 'beat' ? events as PercussionEvent[] : [];
    const tempo = detectTempo(samples, sampleRate, percussion);
    options.onProgress?.({ progress: 1, message: 'Recognition complete.' });
    return {
      mode,
      modelId: mode === 'beat' ? 'local-onset-classifier' : this.pitchEngine?.modelId ?? 'local-yin-pitch-tracker',
      modelVersion: mode === 'beat' ? '1' : this.pitchEngine?.modelVersion ?? '1',
      events,
      ...(tempo.bpm === undefined ? {} : { detectedBpm: tempo.bpm }),
      tempoAlternatives: tempo.alternatives,
    };
  }
}

export const localRecognitionAdapter = new LocalRecognitionAdapter();
