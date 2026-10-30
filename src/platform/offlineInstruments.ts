import { SAMPLED_SOUNDS } from '../library/instrumentRegistry';
import type { InstrumentManifest } from '../audio/sampler/manifest';

/** Same cache the service worker serves instrument files from (src/platform/offlineWorker.ts). */
export const INSTRUMENT_CACHE = 'musicmaker-instruments-v1';

/** Every bundled sampled instrument the sound library uses. */
export const BUNDLED_INSTRUMENT_IDS: readonly string[] = [...new Set(SAMPLED_SOUNDS.flatMap((sound) => sound.instrumentId ? [sound.instrumentId] : []))];

export interface OfflineDeps {
  baseUrl: string;
  fetch: (url: string) => Promise<Response>;
  cache: () => Promise<Pick<Cache, 'match' | 'put'>>;
}

const manifestUrl = (deps: OfflineDeps, id: string) => `${deps.baseUrl}instruments/${id}/manifest.json`;
/** Region URLs exactly as the instrument store requests them, so cached files are found by the worker. */
const fileUrls = (deps: OfflineDeps, manifest: InstrumentManifest) => [...new Set(manifest.regions.map((region) =>
  `${deps.baseUrl}instruments/${manifest.id}/${encodeURIComponent(region.file)}?v=${manifest.version}`))];

async function manifestFor(deps: OfflineDeps, cache: Pick<Cache, 'match' | 'put'>, id: string, online: boolean): Promise<InstrumentManifest | undefined> {
  const url = manifestUrl(deps, id);
  if (online) {
    try {
      const response = await deps.fetch(url);
      if (response.ok) {
        await cache.put(url, response.clone());
        return await response.json() as InstrumentManifest;
      }
    } catch { /* offline: use the cached manifest */ }
  }
  const cached = await cache.match(url);
  return cached ? await cached.json() as InstrumentManifest : undefined;
}

/** How many bundled instruments have their manifest and every audio file cached. */
export async function offlineInstrumentCount(deps: OfflineDeps, ids = BUNDLED_INSTRUMENT_IDS): Promise<number> {
  const cache = await deps.cache();
  let ready = 0;
  for (const id of ids) {
    const manifest = await manifestFor(deps, cache, id, false);
    if (!manifest) continue;
    const files = await Promise.all(fileUrls(deps, manifest).map((url) => cache.match(url)));
    if (files.every(Boolean)) ready++;
  }
  return ready;
}

/** Download every bundled instrument into the cache; reports files done of total. Returns instruments ready. */
export async function makeInstrumentsOffline(deps: OfflineDeps, onProgress: (done: number, total: number) => void,
  ids = BUNDLED_INSTRUMENT_IDS): Promise<number> {
  const cache = await deps.cache();
  const manifests = (await Promise.all(ids.map((id) => manifestFor(deps, cache, id, true)))).filter((item): item is InstrumentManifest => Boolean(item));
  const urls = manifests.flatMap((manifest) => fileUrls(deps, manifest));
  let done = 0;
  onProgress(done, urls.length);
  const queue = [...urls];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      if (!await cache.match(url)) {
        const response = await deps.fetch(url);
        if (!response.ok) throw new Error(`Download failed: ${url}`);
        await cache.put(url, response);
      }
      onProgress(++done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return offlineInstrumentCount(deps, ids);
}

export const browserOfflineDeps = (): OfflineDeps => ({
  baseUrl: import.meta.env.BASE_URL,
  fetch: (url) => fetch(url),
  cache: () => caches.open(INSTRUMENT_CACHE),
});
