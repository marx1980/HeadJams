export function createOfflineWorkerSource(precacheFiles: readonly string[], cacheName: string): string {
  return `
const CACHE_NAME = ${JSON.stringify(cacheName)};
const INSTRUMENT_CACHE = 'musicmaker-instruments-v1';
const PRECACHE_URLS = ${JSON.stringify(precacheFiles)}.map((file) => new URL(file, self.registration.scope).href);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('musicmaker-shell-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin
    || !requestUrl.href.startsWith(self.registration.scope)) return;

  // Sampled instruments: audio files are versioned (?v=) and served cache-first from their own cache,
  // which survives app updates; manifests are network-first so new versions are picked up.
  if (requestUrl.href.startsWith(new URL('instruments/', self.registration.scope).href)) {
    event.respondWith((async () => {
      const cache = await caches.open(INSTRUMENT_CACHE);
      const isManifest = requestUrl.pathname.endsWith('/manifest.json');
      if (!isManifest) {
        const cached = await cache.match(request);
        if (cached) return cached;
      }
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return await cache.match(request) ?? Response.error();
      }
    })());
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return await caches.match(request)
          ?? await caches.match(new URL('index.html', self.registration.scope))
          ?? Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
`.trim();
}
