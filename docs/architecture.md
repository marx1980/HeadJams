# Architecture

## Platform
Web app (PWA): TypeScript, React, Vite. Can later be wrapped with Capacitor for the App Store / Google Play.

## Audio engine
Web Audio API (AudioWorklet where needed). A look-ahead scheduler (`src/audio/scheduler.ts`) driven by a single master clock.

## Modules
- Transport: BPM, play/stop, metronome, quantization.
- Project model (`src/model`): project -> channels -> patterns -> steps.
- Sound library (`src/library`): sample registry with metadata; built-in synthesized starter pack.
- Sample pipeline: decode, trim, normalize, cache.
- Sequencer and loop engine.
- Mixer: per-channel gain, pan, mute, solo.
- Persistence: IndexedDB for projects and samples, plus JSON export.
- UI (`src/ui`): channel strip, step grid, pad view, library browser; tutorials in `src/tutorial`.
- Later: effects chain, arrangement timeline, optional cloud sync.

## State
A single serializable project store with undo history.

## Sound library generation
- Record from mic (level meter, trim, normalize).
- Import WAV/MP3/OGG via drag and drop or file picker.
- Synthesized sounds (kick, snare, hat, bass, lead) from oscillator/pitch/decay/filter parameters.
- Organize: name, tags, favorites, "my library" vs "built-in".
- Store in IndexedDB; export/import library packs (zip).
- Later: slicing samples into pads; resampling project output.

## Testing
Vitest for scheduler and model; Playwright for UI flows later.
