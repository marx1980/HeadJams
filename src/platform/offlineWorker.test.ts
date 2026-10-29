import { describe, expect, it } from 'vitest';
import { createOfflineWorkerSource } from './offlineWorker';

describe('offline service worker source', () => {
  it('pre-caches build files under the registered app scope', () => {
    const source = createOfflineWorkerSource(
      ['index.html', 'assets/app.js', 'manifest.webmanifest', 'icon.svg'],
      'musicmaker-shell-test',
    );

    expect(source).toContain('new URL(file, self.registration.scope).href');
    expect(source).toContain('"index.html","assets/app.js","manifest.webmanifest","icon.svg"');
    expect(source).toContain("cache.addAll(PRECACHE_URLS)");
  });

  it('falls back to the cached app shell for offline navigation', () => {
    const source = createOfflineWorkerSource(['index.html'], 'musicmaker-shell-test');

    expect(source).toContain("request.mode === 'navigate'");
    expect(source).toContain("new URL('index.html', self.registration.scope)");
    expect(source).toContain('self.clients.claim()');
  });

  it('serves sampled instruments from their own long-lived cache', () => {
    const source = createOfflineWorkerSource(['index.html'], 'musicmaker-shell-test');
    expect(source).toContain("const INSTRUMENT_CACHE = 'musicmaker-instruments-v1'");
    expect(source).toContain("new URL('instruments/', self.registration.scope)");
    expect(source).toContain("requestUrl.pathname.endsWith('/manifest.json')");
  });
});
