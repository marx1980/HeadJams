import { describe, expect, it } from 'vitest';
import { BUNDLED_INSTRUMENT_IDS, makeInstrumentsOffline, offlineInstrumentCount, type OfflineDeps } from './offlineInstruments';

function fakes(online: { value: boolean }) {
  const store = new Map<string, Response>();
  const fetched: string[] = [];
  const manifests: Record<string, unknown> = {
    a: { id: 'a', version: 2, regions: [{ file: 'one.wav' }, { file: 'one.wav' }, { file: 'two two.wav' }] },
    b: { id: 'b', version: 1, regions: [{ file: 'x.wav' }] },
  };
  const deps: OfflineDeps = {
    baseUrl: '/MM/',
    fetch: async (url) => {
      if (!online.value) throw new TypeError('offline');
      fetched.push(url);
      const id = url.split('/')[3];
      return url.endsWith('manifest.json') ? new Response(JSON.stringify(manifests[id])) : new Response(new Uint8Array([1, 2]));
    },
    cache: async () => ({
      match: async (url: RequestInfo | URL) => store.get(String(url))?.clone(),
      put: async (url: RequestInfo | URL, response: Response) => { store.set(String(url), response); },
    }) as unknown as Cache,
  };
  return { deps, store, fetched };
}

describe('offline instruments', () => {
  it('lists the bundled instruments', () => {
    expect(BUNDLED_INSTRUMENT_IDS).toEqual(expect.arrayContaining(['acoustic-kit', 'grand-piano', 'nylon-guitar', 'strings', 'brass']));
    expect(BUNDLED_INSTRUMENT_IDS).not.toContain('test-sine');
  });

  it('downloads every file once with the store URLs and counts ready instruments offline', async () => {
    const online = { value: true };
    const { deps, store, fetched } = fakes(online);
    expect(await offlineInstrumentCount(deps, ['a', 'b'])).toBe(0);
    const progress: number[] = [];
    expect(await makeInstrumentsOffline(deps, (done) => progress.push(done), ['a', 'b'])).toBe(2);
    expect([...store.keys()].sort()).toEqual([
      '/MM/instruments/a/manifest.json', '/MM/instruments/a/one.wav?v=2', '/MM/instruments/a/two%20two.wav?v=2',
      '/MM/instruments/b/manifest.json', '/MM/instruments/b/x.wav?v=1',
    ]);
    expect(progress.at(-1)).toBe(3);
    online.value = false;
    expect(await offlineInstrumentCount(deps, ['a', 'b'])).toBe(2);
    online.value = true;
    fetched.length = 0;
    await makeInstrumentsOffline(deps, () => undefined, ['a', 'b']);
    expect(fetched.filter((url) => url.endsWith('.wav?v=2') || url.endsWith('.wav?v=1'))).toEqual([]);
  });
});
