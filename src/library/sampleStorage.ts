export interface SampleData {
  sampleRate: number;
  samples: Float32Array;
}

const DATABASE = 'musicmaker.library.v1';
const STORE = 'samples';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('Sample storage is not available in this browser.'));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open sample storage.'));
  });
}

export async function saveSample(id: string, sample: SampleData): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put({ id, ...sample });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Could not save sample.'));
  }).finally(() => db.close());
}

export async function loadSamples(): Promise<Map<string, SampleData>> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => {
      resolve(new Map(request.result.map(({ id, sampleRate, samples }) => [id, { sampleRate, samples }])));
      db.close();
    };
    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error('Could not load saved samples.'));
    };
  });
}

export function trimSample(samples: Float32Array, start: number, end: number): Float32Array {
  const from = Math.max(0, Math.min(samples.length, Math.floor(start)));
  const to = Math.max(from, Math.min(samples.length, Math.floor(end)));
  return samples.slice(from, to);
}

export function normalizeSample(samples: Float32Array): Float32Array {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak === 0) return samples.slice();
  const gain = 0.98 / peak;
  return samples.map((sample) => sample * gain);
}
