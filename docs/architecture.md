# Architecture

Updated 2026-10-30. The target design for sampled instruments is in `expansion.md`.

## Platform
A PWA built with TypeScript, React and Vite, deployed to GitHub Pages by `.github/workflows/validate.yml` (test, build, deploy on `main`). Capacitor wraps it for Android and iOS. A service worker precaches the app shell.

## Code layout
- `src/model`: the project model (channels with steps, notes and chord events; patterns; arrangement; effects), persistence and versioned migrations (`storage.ts`), music theory and guitar voicing (`music.ts`), and recognition-to-project mapping.
- `src/audio`: the live engine (`engine.ts`), the look-ahead step scheduler (`scheduler.ts`), the offline WAV renderer (`render.ts`, run in `exportWorker.ts`), and the WAV encoder.
- `src/library`: the instrument registry and built-in DSP sounds, `SoundSource` (synth or sample), sample storage (IndexedDB) and processing, drum kits, chord suggestion, arrangement styles, and pitch, onset and tempo recognition.
- `src/ui`: React screens (Beat, Sound, Library, Song), the header tiles, the sound picker, the Sample editor, recognition, MIDI input and the popover.
- `src/tutorial`: tutorial and workflow data, plus progress tracking.
- `src/platform`: the offline service-worker source and the MIDI bridge.

## Audio today
- The scheduler ticks every 25 ms and schedules grid steps 100 ms ahead, with swing.
- On each step, `compileStep` (`src/audio/performance.ts`) turns grid hits, notes and chord events (voicing plus strum stagger) into voice events.
- The live engine plays those voices (pitch-shifted synth or sample) through a master chain: filter, 3-band EQ, delay, reverb.
- WAV export mixes the same voice events in pure DSP inside a worker, which has no Web Audio. Each side keeps its own step-length arithmetic, so exports are bit-identical to before the compiler existed.

## Audio target (`expansion.md` E1 onwards)
```text
Project -> performance compiler (pure TS) -> VoiceEvent[]
             -> live engine (AudioBufferSource + envelopes)
             -> offline renderer (mixes the same events in the worker)
```
## Sampled instruments (E1)
- Bundled instruments live in `app/public/instruments/<id>/` (manifest, audio, `LICENCE.txt`). A test checks each one validates, allows redistribution and fits the download budget.
- `InstrumentStore` (`src/audio/sampler/instrumentStore.ts`) fetches manifests and region audio on demand, decodes to mono, and keeps an LRU cache within the memory budgets. The app prepares the project's instruments in the background; Play and export wait for them.
- `selectRegion`, `RoundRobin`, `VoiceTracker` and `planSampledVoice` are pure and shared: the live engine plays plans with Web Audio nodes (source → envelope → cut gain → pan), and the export worker renders the same plans with `renderSampledVoice`.
- The service worker serves `instruments/` from a separate cache that survives app updates; audio URLs carry `?v=<manifest version>`.

## Storage
- The project is a JSON document in localStorage (`formatVersion` with migrations).
- Sample audio, originals and processing settings live in IndexedDB.
- Preferences and theme use separate `musicmaker.*` keys.
- There is no server and no cloud sync.

## Testing
Vitest covers the model, scheduler, rendering, WAV encoding, sample processing, recognition, the registry, tutorials (including a rendered selector-coverage test) and preferences. Layout is checked in Chromium on the production build (see `CLAUDE.md`).
