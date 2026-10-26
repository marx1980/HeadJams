# Build Plan
This is the source of truth for what should be built next. Research: `docs/research.md`. Architecture: `docs/architecture.md`.

## NEXT

### 2. Phase 2: Sound library and sampling
Status: NEXT
Mic recording, import, library browser (tags, search), trimming, pad view, record tutorial.

## QUEUED

### 3. Phase 3: Richer composition
Status: NOT STARTED
Piano roll with scale/chord assist, multiple patterns, loop launcher, arrangement timeline, tutorials.

### 4. Phase 4: Sound shaping
Status: NOT STARTED
Effects chain (reverb, delay, filter, EQ), pitch/time tools, swing templates.

### 5. Phase 5: Platform and community
Status: NOT STARTED
PWA offline, Capacitor builds, accounts/cloud sync, MIDI, sample marketplace.

## COMPLETED

### 0. Phase 0: Foundations — DONE
### 1. Phase 1: Simple, fully functional MVP — DONE
Channels with sound picker, note-length grid (1/4, 1/8, 1/16), 1/2/4-bar loops with playhead, 30 synthesized starter sounds + sound designer, BPM/volume/mute/solo, localStorage auto-save, WAV export, 3 templates, 5 interactive tutorials (auto-start on first run).
Not yet verified: manual 2-minute usability test in a real browser.

## Decisions / Important Context
- Web/PWA first (React + Vite + TypeScript); native wrapping later via Capacitor.
- Web Audio API with a single master clock and look-ahead scheduling.
- Sounds are synthesized by pure DSP (`src/library/sounds.ts`), so playback and WAV export share one renderer and need no sample downloads.
- "Note length" is the grid resolution (steps per bar = 4/8/16). Projects auto-save to localStorage (IndexedDB planned for Phase 2 samples).
