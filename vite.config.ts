import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createOfflineWorkerSource } from './src/platform/offlineWorker.ts';

function offlineWorkerPlugin(): Plugin {
  return {
    name: 'musicmaker-offline-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((file) => !file.endsWith('.map') && file !== 'service-worker.js');
      const iconBytes = readFileSync(new URL('./app/public/icon-v2.png', import.meta.url)).toString('base64');
      const hash = [...files].sort().join('\n').concat(iconBytes).split('').reduce(
        (value, character) => Math.imul(value ^ character.charCodeAt(0), 16777619) >>> 0,
        2166136261,
      ).toString(36);
      this.emitFile({
        type: 'asset',
        fileName: 'service-worker.js',
        source: createOfflineWorkerSource(
          ['index.html', ...files, 'manifest.webmanifest', 'icon-v2.png'],
          `musicmaker-shell-${hash}`,
        ),
      });
    },
  };
}

// Source entry lives in app/. GitHub Pages publishes the production dist artifact.
export default defineConfig(({ mode }) => ({
  root: 'app',
  base: mode === 'capacitor' ? './' : '/MusicMaker/',
  plugins: [react(), offlineWorkerPlugin()],
  build: { outDir: '../dist', emptyOutDir: true, assetsDir: 'assets' },
  test: { root: '.' },
}));
