import { useEffect, useState } from 'react';
import { BUNDLED_INSTRUMENT_IDS, browserOfflineDeps, makeInstrumentsOffline, offlineInstrumentCount } from '../platform/offlineInstruments';

/** Settings › Offline: download every bundled instrument so the app sounds the same without a network. */
export function OfflineInstruments({ onMessage }: { onMessage: (text: string) => void }) {
  const total = BUNDLED_INSTRUMENT_IDS.length;
  const supported = typeof caches !== 'undefined';
  const [ready, setReady] = useState<number>();
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  useEffect(() => {
    if (!supported) return;
    let live = true;
    void offlineInstrumentCount(browserOfflineDeps()).then((count) => { if (live) setReady(count); }, () => undefined);
    return () => { live = false; };
  }, [supported]);
  if (!supported) return null;
  return (
    <div className="offline-instruments">
      <span id="offline-count">Instruments {ready ?? '…'}/{total}</span>
      <button id="offline-download" className="secondary" disabled={Boolean(progress) || ready === total}
        onClick={() => {
          setProgress({ done: 0, total: 0 });
          makeInstrumentsOffline(browserOfflineDeps(), (done, all) => setProgress({ done, total: all }))
            .then((count) => { setReady(count); onMessage(count === total ? 'Instruments available offline ✓' : `Instruments offline ${count}/${total}`); })
            .catch(() => onMessage('Download stopped · check the connection'))
            .finally(() => setProgress(undefined));
        }}>{progress ? `${progress.done}/${progress.total || '…'}` : ready === total ? 'Downloaded' : 'Download all'}</button>
    </div>
  );
}
