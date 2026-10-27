# Build Plan
This is the source of truth for what should be built next. Research: `docs/research.md`. Architecture: `docs/architecture.md`.

## COMPLETED
### 0. Phase 0: Foundations — DONE
### 1. Phase 1: Simple, fully functional MVP — DONE
Channels with sound picker, note-length grid (1/4, 1/8, 1/16), 1/2/4-bar loops with playhead, 30 synthesized starter sounds + sound designer, BPM/volume/mute/solo, localStorage auto-save, WAV export, 3 templates, 5 interactive tutorials (auto-start on first run).
### 2. Phase 2: Sound library and sampling — DONE
Microphone recording and audio-file import, sample trimming and normalization, searchable/tagged library, pad view, IndexedDB sample storage, sample playback and WAV export, recording tutorial.
### 3. Phase 3: Richer composition — DONE
Piano roll with scale/chord assist, multiple patterns, loop launcher, arrangement timeline, and composition tutorial.
Not yet verified: manual 2-minute usability test in a real browser.

## QUEUED
### 4. Phase 4: Sound shaping — IN PROGRESS
- Effects chain (reverb, delay, filter, EQ) — DONE.
- Pitch/time tools and swing templates — NOT STARTED.
### 5. Phase 5: Platform and community — NOT STARTED
PWA offline, Capacitor builds, accounts/cloud sync, MIDI, sample marketplace.

## Decisions / Important Context
- Web/PWA first (React + Vite + TypeScript); native wrapping later via Capacitor.
- Web Audio API with a single master clock and look-ahead scheduling.
- Built-in sounds are synthesized by pure DSP (`src/library/sounds.ts`); user samples are stored in IndexedDB and project metadata keeps their IDs.
- "Note length" is the grid resolution (steps per bar = 4/8/16). Projects auto-save to localStorage; sample audio is stored separately in IndexedDB.
