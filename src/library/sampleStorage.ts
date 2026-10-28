import { DEFAULT_SAMPLE_SETTINGS, normalizeSampleSettings, type SampleProcessingSettings } from './sampleProcessing';

export interface SampleData {
  id: string;
  samples: Float32Array;
  sampleRate: number;
  originalSamples?: Float32Array;
  processingSettings?: SampleProcessingSettings;
  recordedAt?: number;
  detectedBpm?: number;
  detectedPitch?: number;
  targetPitch?: number;
  metadataVersion?: number;
}

export function normalizeSampleData(sample: SampleData): SampleData {
  const samples = sample.samples instanceof Float32Array ? sample.samples : new Float32Array(sample.samples);
  const originalSamples = sample.originalSamples instanceof Float32Array
    ? sample.originalSamples
    : sample.originalSamples ? new Float32Array(sample.originalSamples) : samples.slice();
  return {
    ...sample,
    samples,
    originalSamples,
    processingSettings: normalizeSampleSettings(sample.processingSettings),
    metadataVersion: 2,
  };
}

export function resampleSample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
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

interface StoredSample {
  id: string;
  samples: Float32Array;
  sampleRate: number;
  originalSamples?: Float32Array;
  processingSettings?: SampleProcessingSettings;
  recordedAt?: number;
  detectedBpm?: number;
  detectedPitch?: number;
  targetPitch?: number;
  metadataVersion?: number;
}

const DB_NAME = 'musicmaker.samples';
const STORE_NAME = 'samples';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('Sample storage is not available in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = (event) => {
      const store = request.result.objectStoreNames.contains(STORE_NAME)
        ? request.transaction?.objectStore(STORE_NAME)
        : request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      if ((event as IDBVersionChangeEvent).oldVersion < 2 && store) {
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const value = cursor.value as StoredSample;
          cursor.update({
            ...value,
            originalSamples: value.samples.slice(),
            processingSettings: { ...DEFAULT_SAMPLE_SETTINGS },
            metadataVersion: 2,
          });
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open sample storage.'));
  });
}

export async function saveSample(sample: SampleData): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      ...sample,
      samples: sample.samples.slice(),
      originalSamples: (sample.originalSamples ?? sample.samples).slice(),
      processingSettings: normalizeSampleSettings(sample.processingSettings),
      metadataVersion: 2,
    } satisfies StoredSample);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save sample.'));
    tx.onabort = () => reject(tx.error ?? new Error('Sample save was cancelled.'));
  }).finally(() => db.close());
}

export async function getSample(id: string): Promise<SampleData | undefined> {
  const db = await openDatabase();
  return new Promise<SampleData | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => {
      const result = request.result as SampleData | undefined;
      if (!result) {
        resolve(undefined);
        return;
      }
      resolve(normalizeSampleData(result));
    };
    request.onerror = () => reject(request.error ?? new Error('Could not load sample.'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Could not load sample.')); };
  });
}

export async function clearAllSamples(): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not clear samples.'));
    tx.onabort = () => reject(tx.error ?? new Error('Clearing samples was cancelled.'));
  }).finally(() => db.close());
}
