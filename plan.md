# Build Plan
This is the source of truth for what should be built next. Research: `docs/research.md`. Architecture: `docs/architecture.md`.

## COMPLETED
### 0. Phase 0: Foundations — DONE
### 1. Phase 1: Simple, fully functional MVP — DONE
Channels with sound picker, note-length grid (1/4, 1/8, 1/16), 1/2/4-bar loops with playhead, 30 synthesized starter sounds + sound designer, BPM/volume/mute/solo, localStorage auto-save, WAV export, 3 templates, interactive tutorials (first one auto-starts on first run; now 28, see Phase 14).
### 2. Phase 2: Sound library and sampling — DONE
Microphone recording and audio-file import, sample trimming and normalization, searchable/tagged library, pad view, IndexedDB sample storage, sample playback and WAV export, recording tutorial.
### 3. Phase 3: Richer composition — DONE
Piano roll with scale/chord assist, multiple patterns, loop launcher, arrangement timeline, and composition tutorial.
Verified in a production browser on 2026-10-27: created and played a beat, imported and saved a sample, recognized a melody, and confirmed the generated track persisted after reload.

## OPEN
- No unblocked Phase 0–12 implementation items remain. Current work is Phase 13 platform support and Phase 14 tutorial completion.

## DONE (continued)
### 4. Phase 4: Sound shaping — DONE
Effects chain (reverb, delay, filter, EQ); pitch/time tools (transpose, shift, duration scaling); swing templates.
### 4b. UI reorganization — DONE
Four screens (Beat, Sound, Library, Song); see `ui-design.md`.

## QUEUED (merged with the Sound Library expansion)
Detailed specs: `docs/sound-library-spec.md` (sections referenced as §n; §16 sample editor, §17-24 recognition). All features of the expansion are retained; its three delivery sequences (§24, §25, §28) are replaced by this single list. Execution rule: one focused PR per sub-phase; read this plan and the code first; preserve existing projects and sounds; add migration/backward-compat tests; run tests and production build; report limitations and risks.

### 5. Sound Library architecture — DONE (§1, §2, §13-15)
- [x] Instrument registry foundation: central starter catalog and built-in/custom entries preserve existing sound IDs; duplicate IDs and supplied sample-asset sets can be validated.
- [x] Central instrument registry wrapping/extending `SoundDef`; stable IDs; existing IDs (`kick-1`, `custom-*`, sample sounds) kept as stable IDs with a mapping; validation of duplicates and missing assets.
- [x] Lazy `SoundSource` abstraction for synth and single-sample assets; on-demand loading with cache, separate preview bus that never modifies the project.
- [x] Hierarchical picker replacing channel sound selection; Favourites, Recent, search, preview, mobile bottom sheet, and Library reuse.
- [x] Missing-sound state and project format v2 migration tests; old sound/sample references are preserved.
- Multisample source selection and playback is deferred; see the final deferred-scope section.
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
- Drum-map channels (MIDI-style slots) remain an optional later upgrade.
### 7. Guitar chords — DONE (§3)
- Guitar chord events store a chord root, quality, duration, and articulation separately from note events; playable six-string voicings are generated without silently substituting unsupported chords.
- Added major, minor, diminished, augmented, suspended, dominant seventh, major seventh, and minor seventh chords, plus sustained, down/up strum, muted, and power-chord articulations.
- Added synthesized acoustic, clean electric, crunch, and power chord presets; chord events play in real time and offline WAV export, and survive project storage and pattern editing.
### 8. Sample Editor — DONE (§16)
Distinct from Phase 4 note transpose/duration tools. The Library editor retains original audio and processing settings in IndexedDB, previews original/processed samples without changing the project, and caches the processed playback audio.
- [x] 8a: versioned sample metadata and migration; non-destructive trim, auto silence trim, normalization, gain, noise reduction, gate, de-click, fades, compare, undo/redo, and reset.
- [x] 8b: pitch shift, fine tune, detected-pitch tune-to-note, linked speed, pitch-preserving stretch, and reverse.
- [x] 8c: BPM and pitch detection, fit to beat/bar, and project-tempo-aware processing.
- [x] 8d: three-band EQ, high-pass filter, and Off/Gentle/Strong compression.
- [x] 8e: reverb, delay, distortion, chorus, and lo-fi effects.
### 9. Editor hardening and UX polish — DONE (§25 Phase 7)
- [x] Note events preserve optional `confidence`, `pitchBend`, and `sourceTakeId`; beat steps preserve confidence and source-take metadata without changing the existing step grid or project format.
- [x] Piano roll and Beat grid identify low-confidence events and source takes, expose pitch-bend cues, and support arrow-key navigation.
- [x] Sound picker has family icons and colour accents, loading/empty/missing states, synchronized Favourites/Recent lists, and keyboard-accessible navigation.
- [x] Checked the procedural catalog: the existing 67 presets cover the specified instrument families; sampled packs remain deferred until licensed assets are available (§6).
### 10. Recognition — DONE (§17-21, §23)
- [x] 10a: replaceable recognition adapter, seconds-based melody/percussion events, versioned project migration, and Original/Cleaned/Quantised provenance.
- [x] 10b: local YIN melody/bass pitch tracking with confidence and bend points; scale-aware pitch correction, transpose, split/join/move/resize/delete, undo, and restore controls.
- [x] 10c: local onset detection and broad percussion classification; per-event class/sound correction, confidence display, and playable unknown events.
- [x] 10d: BPM estimates and half/double alternatives, count-in/metronome, loop-length recording with position display, adjustable track/selection quantisation, and layered editable tracks.
- [x] Original audio is retained in IndexedDB and added as a muted, independently controllable playback track; generated events retain stable source-take and confidence metadata.
- Privacy: all shipped recognition runs on-device. A third-party pitch engine can be supplied through the adapter, but Basic Pitch is not bundled; pitch and percussion classifications are best-effort and should be manually reviewed.
### 11. Arrangement assistance — IN PROGRESS (§22)
- [x] 11a: scale-aware chord suggestions from a selected melody, with confidence, editable alternatives, original-performance-only input, and separate generated tracks that can be added, replaced, or removed.
- [x] 11b: previewable bass generation following reviewed chord suggestions or melody notes; generated bass tracks can be added, replaced, removed, and edited separately from their source.
- [x] 11c: scale-aware melody harmony and chord accompaniment are previewable; generated tracks can be edited, replaced, muted, and removed independently of their sources.
- [x] 11d: Acoustic, Pop, Electronic, and Orchestral arrangement styles select accompaniment instruments and rhythmic patterns.
- [x] 11e: offline WAV export supports 44.1/48/96 kHz, 16/24-bit PCM, and optional stereo peak normalization; all rendering remains local.
### 12. Hardening — DONE
- [x] Accessible keyboard navigation and sound-picker focus handling retained; reduced-motion preferences disable animation.
- [x] WAV rendering and encoding run in a Web Worker; export reports progress state and failures without blocking the interface.
- [x] WAV tests cover 44.1/48/96 kHz, stereo PCM, 16/24-bit output, normalization, and invalid input.
- [x] Documented browser-local storage, privacy limits, and GitHub Pages release checks; added CI test/build validation.
- [x] Verified tests and production build. Offline PWA caching remains Phase 13.
### 13. Platform and community — IN PROGRESS (last)
- [x] PWA offline app shell and procedural starter-sound bundle caching; user sample audio remains available offline in IndexedDB.
- [x] Capacitor Android/iOS projects, native sync workflow, and relative-asset mobile build.
- [x] MIDI keyboard input: device selection, live monitoring, quantized note recording into the selected pattern, browser Web MIDI, and native iOS/Android bridge.
- Drum-map MIDI slots remain an optional later upgrade.

### 14. Guided tutorials — DONE
- [x] 14a: tutorial data model (tab, group, level, summary, features), per-tab Help hub with Actions/Workflows modes, "Show all tabs", completion persistence (`musicmaker.tutorialDone`) and reset.
- [x] 14b: overlay Back/Skip step/Show me/Exit, step counter, `aria-live` announcements, missing-target fallbacks, reduced-motion, mobile docking, first-visit nudges for non-Beat tabs.
- [x] 14c-e: tutorials for tempo/swing, mix, templates, sound picker, drum kits, guitar chords, pitch/time, Sound Designer, effects, import, Sample Editor, recognition, patterns, timeline, arrangement assistance, export options, privacy/offline, confidence cues, keyboard navigation, and library search/pads.
- [x] 14f: seven workflows and a coverage test (`src/tutorial/tutorials.test.ts`).
- [x] Added actionable sample editing, recognition correction, and library search/pad-view events; added keyboard-navigation, confidence-cue, and library-use tutorials.
- [x] Added microphone/MIDI capability gating, tutorial overlay focus management, and tutorial predicate/capability tests.
- [x] Rendered-DOM selector coverage includes conditional MIDI connect/record states. Verified the first-beat tutorial and target highlight on desktop and the tutorial menu, target docking, and simulated MIDI-permission-denied guidance on mobile; physical MIDI hardware was unavailable.

### 15. UI redesign and appearance skins — DONE
- [x] Added eight mockup-inspired visual skins selectable from Project menu → Settings → Appearance.
- [x] Shared design tokens cover app surfaces, controls, active states, focus, and semantic feedback across Beat, Sound, Library, and Song.
- [x] Skin preference is stored separately from project data, restored on web and Capacitor builds, and safely defaults for unsupported or unavailable storage.
- [x] Added theme persistence and selector tests; documented the setting in the README.

### 16. App icon, UI visual plan, and Help/icon refresh — DONE (PRs #27–33)
- [x] #27: `mm icon.jpeg` adopted as the app icon for web/PWA (favicon, touch icon, manifest, offline precache) and Android/iOS launcher and store assets.
- [x] #28: service-worker cache name now hashes the icon bytes so icon changes rotate the cache; root build gets icon links and `icon.png`; old `icon.svg` removed.
- [x] #29: web icon renamed to `icon-v2.png` (manifest, `app/index.html`, precache list, cache hash) to bust iOS home-screen icon caching. Unconfirmed on device; users may need to re-add the bookmark. Native Capacitor icons untouched.
- [x] #30: `docs/ui-visual-plan.md` (findings and seven-phase plan: tokens/sticky shell, viewport-aware popover/bottom sheet, SVG icon set, palettes, compact Beat card, Sound/Library/Song redesign, polish) and eight static theme mockups in `docs/mockups/`. Proposed grouped menus: per-channel Tools and More; header Project and Help; Library card More.
- [x] #31: GitHub Pages gallery of the mockups at `/mockups/`.
- [x] #32: eight selectable skins (Midnight Studio, Paper & Ink, Neon Pulse, Forest Studio, Ocean Light, High Contrast, Candy Pop, Vintage Amber) via Project menu → Settings → Appearance; stored under `musicmaker.theme`, default Midnight Studio. Shared design tokens.
- [x] #33: single contextual "Help" button (tutorial reset/close moved into the panel); themed SVG screen and instrument-family icons, with distinct bass and guitar art.

### 17. UI polish round 2 — PROPOSED (awaiting approval)
Problems: the "..." (Project) menu still opens partly off-screen; it is one long mixed menu; Settings is a labeled button that only opens skin selection; many icons look poor; mobile bottom tab bar is clipped by rounded screen corners and icon/label may not fit on one row.
- [ ] 17a. Viewport-aware popovers (implements #30 phase 2). Replace the fixed `.menu-popup { right:0; top:46px }` with a shared popover that measures its trigger and the viewport (including `visualViewport` and safe-area insets), flips/clamps horizontally and vertically, caps `max-height` with internal scroll, and closes on outside click/Escape/resize. On widths ≤640px render as a bottom sheet. Reuse for Help, per-channel and Library menus.
- [ ] 17b. Split the "..." menu into grouped header buttons, each with its own icon and popover:
  - **File/Project:** new, rename, save/load/import project.
  - **Export:** WAV format, sample rate, bit depth, normalize, Export WAV.
  - **View:** Show all tabs (and other display toggles).
  - **Settings (gear):** see 17c.
  - Help stays separate. Final grouping is checked against the actual current menu items; the header must fit on narrow screens with no empty gap (buttons share one flex row, wrap-safe).
- [ ] 17c. Settings: icon-only gear button (accessible name/tooltip "Settings"). Its popover contains the skin selection inline (swatch list with palette preview) instead of a button opening a separate Appearance dialog; remove the "Skins"/Appearance click-through and keep `musicmaker.theme` persistence. If a labeled entry is still needed anywhere, label it "Skins", not "Settings". Update `AppearanceSettings` and its tests.
- [ ] 17d. New icon set (implements #30 phase 3): one SVG sprite/component set on a shared 24px grid with consistent stroke width, rounded joins, `currentColor` and theme tokens, rendered slightly larger (about 22–24px, 44px touch targets). Cover Project, Export, View, gear, Help, tabs (Beat, Sound, Library, Song), per-channel actions, transport, and instrument families. Review in a rendered preview in all eight skins and at small sizes before replacing the existing icons; no emoji or glyph characters remain.
- [ ] 17e. Bottom tab bar: add safe-area and extra curved-corner padding (`env(safe-area-inset-*)` plus a minimum side/bottom buffer, `viewport-fit=cover`), replace the guessed `.app { padding-bottom: 200px }` with a value derived from tab bar height. Each tab button becomes a two-row stack (icon on top, label below) so it never has to share a row; verify it with long labels and at 320–430px widths.
- [ ] 17f. Tests and verification: update tutorial selectors that target the old menu/Settings button; add tests for popover positioning logic and inline skin selection; check screenshots on desktop and narrow mobile (including a simulated notch/curved insets) for all eight skins; run `npm test` and `npm run build`; update README and `docs/ui-visual-plan.md`.

## Decisions / Important Context
- Web/PWA first (React + Vite + TypeScript); native wrapping later via Capacitor.
- Web Audio API with a single master clock and look-ahead scheduling.
- Built-in sounds are synthesized by pure DSP (`src/library/sounds.ts`); user samples are stored in IndexedDB and project metadata keeps their IDs.
- "Note length" is the grid resolution (steps per bar = 4/8/16). Projects auto-save to localStorage; sample audio is stored separately in IndexedDB.

## DEFERRED — NOT IN CURRENT SCOPE
- Account creation and cloud sync, including synchronization of samples, processing settings, and recognition data.
- Sample marketplace.
- Any feature requiring third-party assets without verified licenses and attribution, including sampled packs and multisample playback. No third-party samples are bundled.
