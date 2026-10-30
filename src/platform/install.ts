import { useEffect, useState } from 'react';

/** Chrome/Edge/Android install prompt (adoption.md: install prompt). Safari has none; it uses Add to Home Screen. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** Call once at startup, before the app renders, so an early event is not missed. */
export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => { deferred = undefined; notify(); });
}

export function useInstallPrompt(): { available: boolean; install: () => Promise<boolean> } {
  const [available, setAvailable] = useState(Boolean(deferred));
  useEffect(() => {
    const update = () => setAvailable(Boolean(deferred));
    listeners.add(update);
    update();
    return () => { listeners.delete(update); };
  }, []);
  return {
    available,
    install: async () => {
      const event = deferred;
      if (!event) return false;
      await event.prompt();
      const { outcome } = await event.userChoice;
      deferred = undefined;
      notify();
      return outcome === 'accepted';
    },
  };
}
