import type { RecognitionMode, RecognitionResult } from '../model/recognition';
import { detectOnsets } from './beatboxRecognition';
import { recognizePitch } from './pitchRecognition';
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

export class LocalRecognitionAdapter implements RecognitionAdapter {
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
      : recognizePitch(samples, sampleRate, mode);
    if (options.signal?.aborted) throw new DOMException('Recognition cancelled.', 'AbortError');

    options.onProgress?.({ progress: 0.8, message: 'Estimating tempo…' });
    const percussion = mode === 'beat' ? events : [];
    const tempo = detectTempo(samples, sampleRate, percussion);
    options.onProgress?.({ progress: 1, message: 'Recognition complete.' });
    return {
      mode,
      modelId: mode === 'beat' ? 'local-onset-classifier' : 'local-yin-pitch-tracker',
      modelVersion: '1',
      events,
      ...(tempo.bpm === undefined ? {} : { detectedBpm: tempo.bpm }),
      tempoAlternatives: tempo.alternatives,
    };
  }
}

export const localRecognitionAdapter = new LocalRecognitionAdapter();
