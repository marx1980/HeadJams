import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Source entry lives in app/. Production build is written to the repo root
// (index.html + assets/) because GitHub Pages publishes main:/root.
export default defineConfig({
  root: 'app',
  base: '/MusicMaker/',
  plugins: [react()],
  build: { outDir: '..', emptyOutDir: false, assetsDir: 'assets' },
  test: { root: '.' },
});
