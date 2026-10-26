# Build Plan
This is the source of truth for what should be built next. Research: `docs/research.md`. Architecture: `docs/architecture.md`.

## NEXT

### 1. Phase 1: Simple, fully functional MVP
Status: NEXT
Goal: A new user makes a looping beat within 2 minutes with no help.

Requirements:
- Channels with instrument/sample picker.
- 16-step grid with selectable note length (1/4, 1/8, 1/16).
- Loop length in bars (1, 2, 4) with looping playhead.
- Starter pack (~30 sounds) and synth sound generator.
- Play/stop, BPM, volume, mute/solo.
- Auto-save/load; WAV export; preset templates.
- Tutorials: first beat, note length, loop, add channel, save/export.

## QUEUED

### 2. Phase 2: Sound library and sampling
Status: NOT STARTED
Mic recording, import, library browser (tags, search), trimming, pad view, record tutorial.

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
Research report, architecture doc, Vite/React/TS scaffold, project data model, look-ahead scheduler with tests.

## Decisions / Important Context
- Web/PWA first (React + Vite + TypeScript); native wrapping later via Capacitor.
- Web Audio API with a single master clock and look-ahead scheduling.
