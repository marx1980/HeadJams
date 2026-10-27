import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Source entry lives in app/. GitHub Pages publishes the production dist artifact.
export default defineConfig({
  root: 'app',
  base: '/MusicMaker/',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true, assetsDir: 'assets' },
  test: { root: '.' },
});
