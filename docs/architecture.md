# Architecture

## Platform
Web app (PWA): TypeScript, React, Vite. Can later be wrapped with Capacitor for the App Store / Google Play.

## Audio engine
Web Audio API (AudioWorklet where needed). A look-ahead scheduler (`src/audio/scheduler.ts`) driven by a single master clock.

## Modules
- Transport: BPM, play/stop, metronome, quantization.
- Project model (`src/model`): project -> channels -> patterns -> steps.
- Sound library (`src/library`): sample registry with metadata; built-in synthesized starter pack.
- Sample pipeline: decode imported/recorded audio, trim, normalize, cache.
- Sequencer and loop engine.
- Mixer: per-channel gain, pan, mute, solo.
- Persistence: localStorage for project metadata and IndexedDB for sample audio.
- UI (`src/ui`): channel strip, step grid, pad view, library browser; tutorials in `src/tutorial`.
- Later: effects chain, arrangement timeline, optional cloud sync.

## State
A single serializable project store with undo history.

## Sound library generation
- Record from mic, trim, and normalize.
- Import browser-decodable audio (including WAV/MP3/OGG) via file picker.
- Synthesized sounds (kick, snare, hat, bass, lead) from oscillator/pitch/decay/filter parameters.
- Organize: name, tags, favorites, "my library" vs "built-in".
- Store sample audio in IndexedDB; search and filter the library by text and tags.
- Later: slicing samples into pads; resampling project output.

## Testing
Vitest for scheduler and model; Playwright for UI flows later.
