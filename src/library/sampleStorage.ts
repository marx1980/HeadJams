export interface SampleData {
  id: string;
  samples: Float32Array;
  sampleRate: number;
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
}

const DB_NAME = 'musicmaker.samples';
const STORE_NAME = 'samples';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('Sample storage is not available in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open sample storage.'));
  });
}

export async function saveSample(sample: SampleData): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ ...sample, samples: sample.samples.slice() } satisfies StoredSample);
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
    request.onsuccess = () => resolve(request.result as SampleData | undefined);
    request.onerror = () => reject(request.error ?? new Error('Could not load sample.'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Could not load sample.')); };
  });
}
