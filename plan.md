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
- [x] Instrument registry foundation: central starter catalog and built-in/custom entries preserve existing sound IDs; duplicate IDs and supplied sample-asset sets can be validated.
- [x] Central instrument registry wrapping/extending `SoundDef`; stable IDs; existing IDs (`kick-1`, `custom-*`, sample sounds) kept as stable IDs with a mapping; validation of duplicates and missing assets.
- [x] Lazy `SoundSource` abstraction for synth and single-sample assets; on-demand loading with cache, separate preview bus that never modifies the project.
- [x] Hierarchical picker replacing channel sound selection; Favourites, Recent, search, preview, mobile bottom sheet, and Library reuse.
- [x] Missing-sound state and project format v2 migration tests; old sound/sample references are preserved.
- [ ] Multisample source selection and playback; deferred until `SoundDef` can represent multisample zones and licensed assets are available.
### 6. Instruments and drums — DONE (§4-11; procedural starter catalog)
- [x] Added a first synthesized drum and percussion expansion while retaining the existing catalog IDs and project format.
- [x] Added synthesized starter presets in the Keys group.
- [x] Added synthesized starter presets in the Strings group.
- [x] Added synthesized starter presets in the Brass & Winds group.
- [x] Added Bass Finger.
- [x] Added Bass Pick.
- [x] Added Bass Slap.
- [x] Added Analog Lead.
- [x] Added Digital Lead.
- [x] Added Warm Pad.
- [x] Added Soft Pluck.
- [x] Added Kick 808.
- [x] Added Snare Rimshot.
- [x] Added Maraca percussion.
- [x] Added five synthesized guitar-note presets, with playable note-mode metadata.
- [x] Organized built-in sounds into groups and subgroups, re-categorized legacy Lead presets as Synths, and preserved all existing IDs.
- [x] Added source, attribution, and license-status records for all built-in procedural sounds.
- [x] Added Studio, 808, and Percussion kits; kit application maps by channel role, preserves pattern content, asks before replacing assignments, and respects the channel limit.
- [ ] Sampled packs remain deferred until audio assets with verified licenses and attribution are available; no third-party samples are bundled.
- Drum-map channels (MIDI-style slots) remain an optional later upgrade.
### 7. Guitar chords — DONE (§3)
- Guitar chord events store a chord root, quality, duration, and articulation separately from note events; playable six-string voicings are generated without silently substituting unsupported chords.
- Added major, minor, diminished, augmented, suspended, dominant seventh, major seventh, and minor seventh chords, plus sustained, down/up strum, muted, and power-chord articulations.
- Added synthesized acoustic, clean electric, crunch, and power chord presets; chord events play in real time and offline WAV export, and survive project storage and pattern editing.
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
