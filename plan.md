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

## OPEN
- Manual 2-minute usability test in a real browser (Phase 3).

## DONE (continued)
### 4. Phase 4: Sound shaping — DONE
Effects chain (reverb, delay, filter, EQ); pitch/time tools (transpose, shift, duration scaling); swing templates.
### 4b. UI reorganization — DONE
Four screens (Beat, Sound, Library, Song); see `ui-design.md`.

## QUEUED (merged with the Sound Library expansion)
Detailed specs: `docs/sound-library-spec.md` (sections referenced as §n; §16 sample editor, §17-24 recognition). All features of the expansion are retained; its three delivery sequences (§24, §25, §28) are replaced by this single list. Execution rule: one focused PR per sub-phase; read this plan and the code first; preserve existing projects and sounds; add migration/backward-compat tests; run tests and production build; report limitations and risks.

### 5. Sound Library architecture — IN PROGRESS (§1, §2, §13-15)
- [x] Central instrument registry wrapping `SoundDef`; stable IDs retained; duplicate IDs and missing sample assets validated.
- [x] Synth/sample source resolution, cached audio buffers, and a separate preview bus that bypasses project playback/effects.
- [x] Hierarchical, mobile-friendly picker replacing the channel sound dropdown; Favourites, Recent, search, preview, and Library tag reuse.
- [x] Explicit missing/unavailable-sound state; project format version 2 migration tests preserve legacy IDs and composition.
- [ ] Add multisample sources and on-demand loading for external sound packs when licensed pack assets are available.
### 6. Instruments and drums — NOT STARTED (§4-11)
- Keys, guitar notes, bass, strings, synths, brass/winds; expanded drums and percussion; licence/attribution records.
- Drum kits: a kit creates ordinary percussion channels (no engine change); each channel stores `kitId` and `role` (kick, snare, ...) so a later kit swap maps by role and keeps patterns. A drum-map channel (MIDI-style slots) is an optional later upgrade.
- Re-categorise the existing 30 synth sounds into the new groups without changing IDs.
- Assets: synthesized sounds stay the default; sampled packs live in a `sounds/` folder served from GitHub Pages and fetched on demand behind `SoundSource` (CDN can replace later); start with a small core.
### 7. Guitar chords — NOT STARTED (§3)
- Chord event (symbol + articulation: sustained, down/up strum, muted, power) resolved to playable voicings; fallback generated voicing; never silently substitute chords. Reuse Phase 3 chord assist.
### 8. Sample Editor — NOT STARTED (§16)
Distinct naming from Phase 4 note transpose/duration tools (these edit audio, those edit notes). Lives in the Library screen. Reuse existing EQ/filter/reverb/delay DSP via offline render.
- 8a: sample metadata and IndexedDB migration (original, settings, cached processed, version); non-destructive chain; own undo/reset; noise reduction, gate, fades, gain; original vs processed compare.
- 8b: pitch shift, fine tune, tune-to-note, speed, time stretch, reverse.
- 8c: BPM detection, fit to beat/bar.
- 8d: 3-band EQ, high-pass, compression presets.
- 8e: creative effects (reverb, delay, distortion, chorus, lo-fi).
### 9. Editor hardening and UX polish — NOT STARTED (§25 Phase 7)
- Piano roll and Beat grid ready for recognised events (optional `confidence`, `pitchBend`, source take on the existing step-based events); search/favourites/recent polish; remaining instruments.
### 10. Recognition — NOT STARTED (§17-21, §23)
Keep the step-based project `NoteEvent`; recognition output uses a separate seconds-based type quantised into step events.
- 10a: recognition adapter and event models; Original/Cleaned/Quantised versions stored with the sample.
- 10b: melody and bass (Basic Pitch behind the adapter, YIN fallback).
- 10c: beatbox (onset detection + broad classifier, manual correction, kit mapping).
- 10d: tempo detection, count-in/metronome, quantisation, loop recording, multi-track layering.
- Privacy: on-device processing by default.
### 11. Arrangement assistance — NOT STARTED (§22)
Chord suggestions, bass generation, accompaniment/harmony, style templates, higher-quality rendering/export. Generated material kept separate from transcription.
### 12. Hardening — NOT STARTED
Accessibility, privacy, performance, export, deployment; expansion definition of done (§27).
### 13. Platform and community — NOT STARTED (last)
PWA offline (including sound-pack and sample caching), Capacitor builds, MIDI (optionally drum map), accounts/cloud sync (incl. sample processing and recognition data), sample marketplace (reusing asset-licence records).

## Decisions / Important Context
- Web/PWA first (React + Vite + TypeScript); native wrapping later via Capacitor.
- Web Audio API with a single master clock and look-ahead scheduling.
- Built-in sounds are synthesized by pure DSP (`src/library/sounds.ts`); user samples are stored in IndexedDB and project metadata keeps their IDs.
- "Note length" is the grid resolution (steps per bar = 4/8/16). Projects auto-save to localStorage; sample audio is stored separately in IndexedDB.
