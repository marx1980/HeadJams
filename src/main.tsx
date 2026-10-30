import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { captureInstallPrompt } from './platform/install';

captureInstallPrompt();

createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`, {
    scope: import.meta.env.BASE_URL,
  }).catch(() => undefined);
}
