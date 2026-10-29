# MusicMaker Expansion v2: Sampled Instruments and Guitar Performance

Status: **Proposed, awaiting Marko's approval.** This revises the original `expansion.md` (2026-10-29). Once approved, its phases get added to `plan.md` as Phase 18 onwards. Until then, `plan.md` stays the source of truth.

Goal (unchanged): stop relying on synthesised, MIDI-like instrument sounds. Play real recorded samples through one reusable sampler, and give guitar its own performance logic.

---

## 1. Review of the original document

### What it gets right
- The split between a generic sampler ("which audio, how is it played") and a guitar performer ("how would a guitarist play this") is the right core design.
- Musical events stay independent of audio assets. The current project format already works this way.
- Progressive fallback, seeded humanisation, deterministic export, and non-destructive sample processing are all correct.
- Curated chord voicings with simple scoring, rather than a complex solver, is the right first step.
- Personal sampling is optional rather than a prerequisite.

### Problems and gaps

| # | Issue in the original | Why it matters | Change |
|---|---|---|---|
| 1 | Written as if starting from scratch | About a third of it already exists: the look-ahead scheduler, string/fret voicing search, strum stagger, velocity and pitch bend on notes, sample storage and the non-destructive editor, the instrument registry with missing-sound states, and WAV export in a worker. | Build on these instead of re-creating them (section 2). |
| 2 | Offline rendering treated as "later" | WAV export already exists, in a Web Worker with no Web Audio. It reimplements playback in `render.ts`, separately from `engine.ts`. A new sampler that only lives in `engine.ts` would break or silently change exports. | Add a shared, pure **performance compiler** that both playback and export consume (section 3). This is the main structural change. |
| 3 | "Personal use" licence assumption | The repo is **public** and the app is served from GitHub Pages, so any sample committed to it is redistributed. | Bundle only samples whose licence allows redistribution (CC0, CC-BY, permissive). Anything else becomes a local pack, imported on the device into IndexedDB and never committed. |
| 4 | Recorded-chord path (Path A) assumes free chord libraries exist | A short search found free per-note guitar sets (FreePats nylon guitar, CC0; FreePats steel-string, GPL-3 with exception), but no freely redistributable recorded strummed-chord library. | Path A is fed by your own recordings or local packs and moves late in the plan. Path B (built from per-note samples) is the main guitar path. |
| 5 | No memory or download budget | Decoded PCM is about 172 KB/s per mono channel at 44.1 kHz. A full guitar set (6 strings × 13 frets × 3 velocities × 2 round robins at about 2 s) is roughly 160 MB decoded, too much for an iPhone tab. | Set explicit budgets per instrument and per project (section 5). Use mono, 1–2 velocity layers, a sample every 2–3 semitones, trimmed tails, and lazy loading. |
| 6 | Instrument priority puts drums 6th | MusicMaker is a beat maker first, and drum kits are its most-used sounds. Drums are small one-shots: the cheapest realism win and the simplest test of the manifest pipeline. | Drums first, then guitar. |
| 7 | New 30-file folder tree and Tone.js | The app is about 7,700 lines. Its playback layer is `src/audio` plus `src/library`. Tone.js would duplicate the existing scheduler. | Map responsibilities into existing folders with a handful of new modules. No Tone.js. |
| 8 | A global "new engine" feature flag | Sounds are chosen per channel, so a global flag adds little. | Each instrument is either sampled or "Classic synth". Synth presets keep their IDs as a Classic group, so old projects never change sound silently. |
| 9 | Beat-based events, tempo map, seek, automation | The project model is step-based with a single BPM. There's no tempo automation or seek UI. | Keep the step model and convert to seconds in the compiler. Defer tempo map, seek and automation until a feature needs them. |
| 10 | Personal instrument builder as a full phase | Recording, import, trim, fades, normalising, pitch detection and the non-destructive editor already exist (Phase 8). | Shrink it to multi-root mapping, range assignment and progressive coverage. |
| 11 | Not covered | iOS audio unlock and memory kills; which formats iOS can decode; PWA caching of large samples; loudness matching between sampled and synth sounds; tutorials; the lean-UI rule. | Each is assigned to a phase below. |
| 12 | The current voicing solver is not discussed | `guitarChordPitches` picks one note per chord tone (3–4 notes). A real guitar strums 4–6 strings with doubled tones in fixed shapes. That is a large part of why chords sound un-guitar-like, separate from the synth tone. | A curated voicing dictionary, as data, is required in the first guitar phase. |

---

## 2. What already exists and how it maps

| Original proposal | Existing code | Action |
|---|---|---|
| Look-ahead scheduler | `audio/scheduler.ts` (step-based, 25 ms tick, 100 ms look-ahead, swing) | Keep. Feed it compiled voice events. |
| AudioBuffer cache | `Engine.buffers`, keyed by `SoundSource` | Extend into an LRU cache with byte accounting. |
| Instrument manifests and registry | `library/instrumentRegistry.ts`: stable IDs, groups, missing-asset validation, provenance records | Add a `sampled` source kind that points to a manifest. |
| Lazy sound loading | `library/soundSource.ts` (`synth` and `sample` kinds) | Add `multisample` and `guitar` kinds. |
| Note events with velocity and pitch bend | `NoteEvent` in `model/project.ts` | Keep. Add optional `articulation`. |
| Guitar chord events and strums | `ChordEvent` with down/up strum, muted and power; stagger in `engine.ts` and `render.ts` | Keep the event and move strum logic into the guitar performer. Add `voicingId`, `strumMs` and `humanise`. |
| String/fret voicing | `guitarChordPitches` in `model/music.ts` (search-based) | Replace with dictionary plus scoring, and keep the solver as a fallback for unsupported chords. |
| Personal sampling | Sample editor: recording, import, trim, fades, normalise, gain, pitch detection, IndexedDB with originals kept | Reuse. Add multi-root instruments. |
| Effects | Master filter, EQ, delay and reverb in both engine and renderer | Keep. Per-track buses come later. |
| WAV export | `render.ts` in a worker (44.1/48/96 kHz, 16/24-bit) | Must support samples from day one (section 3). |
| Missing-sound UI | Sound picker missing and loading states, project format v2 migration | Reuse for "pack not installed" and "loading". |

---

## 3. Architecture (revised)

```text
Project (steps, notes, chord events, instrument per channel, seed)
   |
   v
Performance compiler  (pure TypeScript, no Web Audio, unit-testable)
   |-- drum and one-shot performer
   |-- note performer (sampler region selection)
   |-- guitar performer (voicing -> strings -> strum -> humanise)
   v
VoiceEvent[]  { regionId | synthSoundId, startSec, durSec, rate, gain, pan, envelope, chokeGroup }
   |                                   |
   v                                   v
Realtime engine (engine.ts)        Offline renderer (render.ts in worker)
 schedules AudioBufferSource +      mixes the same VoiceEvents from
 gain envelopes, voice cap, choke   decoded PCM passed to the worker
```

- One compiler means playback and WAV export always agree. Today, `engine.ts` and `render.ts` duplicate chord, strum and pitch logic, so this also removes existing duplication.
- Classic synth sounds go through the same compiler: their VoiceEvents point at the existing synth renderer.
- **Region selection** uses deterministic scoring, as in the original section 11. Round robin and humanisation use a seeded PRNG keyed by project seed, channel and step, so playback, loops and exports are reproducible.
- **Assets**: `public/instruments/<id>/manifest.json`, plus compressed audio and `LICENCE.txt`. They're fetched on demand, decoded once, cached in memory (LRU) and stored in a separate Cache Storage bucket with a runtime cache-first rule, not the app-shell precache. Local, non-redistributable packs are imported from a zip file into IndexedDB under the same manifest schema.
- **Format**: AAC (`.m4a`) or MP3 derivatives for the browser. Ogg and Opus decoding is unreliable on older iOS versions, so only add them after testing on your phone. WAV masters are not committed. The manifest records their source URL instead.
- **New modules** (inside the existing structure): `audio/performance.ts` (compiler), `audio/sampler/manifest.ts` (types and validator), `audio/sampler/selectRegion.ts`, `audio/voices.ts` (voice cap and choke groups), `library/guitar/voicings.ts` (data dictionary), `library/guitar/strum.ts`, `library/guitar/patterns.ts`, and `scripts/build-manifest.mjs` (dev tool).

---

## 4. Revised phases

Each phase is one or two focused PRs. Every phase must:
- keep existing projects playing exactly as before unless the user picks a new instrument;
- pass `tsc`, `npm test` and the build;
- update tutorials and `skill.md` where the UI changes;
- add no explanatory text on screen.

### E0. Performance compiler (no audible change)
- Extract the step → voice-event logic from `engine.ts` and `render.ts` into `audio/performance.ts`. Both consume it.
- Add a project-level `seed`, with a migration that sets a stable default.
- Add manifest types, a validator and a tiny CC0 test-fixture instrument (a few short notes, under 200 KB) under `src/test-fixtures`.
- Acceptance: WAV export of every template is sample-identical, or within ±1 LSB, before and after. Realtime playback is unchanged by ear.

### E1. Sampler core
- Region selection (note, velocity, articulation, round robin), pitch-shift limit per manifest, natural one-shot or ADSR envelope, release fade, voice cap with steal order (released → quietest → oldest), and choke groups.
- Lazy loading with a ready state in the sound picker. Playback never substitutes a different instrument silently: a channel shows "loading" until its instrument is ready.
- The worker renderer receives decoded PCM and renders sampled voices.
- Budgets enforced: about 8 MB compressed per instrument download, about 40 MB decoded per instrument, and an LRU-evicted global decoded cache of about 150 MB. Tune these on your phone.
- Acceptance: unit tests for selection, velocity boundaries, round-robin order, pitch limit and voice cap. The fixture instrument sounds the same in playback and in WAV export.

### E2. First sampled pack: drums and percussion
- One CC0 or CC-BY acoustic kit, plus a few percussion one-shots, mapped onto the existing drum-kit roles (kick, snare, hats, toms, cymbals, percussion). Exact library chosen and licence verified during this phase.
- A "Sampled kit" option in drum kits. The synth Studio, 808 and Percussion kits stay as they are.
- 2–3 velocity layers where available, and round robin on snare and hats.
- Hi-hat choke: closed or pedal hat chokes the open hat.
- Acceptance: the kit loads in under 2 s on Wi-Fi, a 4-bar loop has no machine-gun repetition at 16ths, and export matches playback.

### E3. Real guitar (constructed path)
- Bundle the FreePats nylon guitar (CC0). This is the first and only factory guitar in this phase (decided 2026-10-30). Steel-string and electric guitars move to E5 as optional additions; the FreePats steel-string set (GPL-3 with exception) is only used if its licence terms are acceptable.
- Voicing dictionary as data: major, minor, 7, maj7, m7, sus2, sus4, power chords and common slash chords. Open and barre shapes tagged open, barre, position and easy. Scoring takes movement from the previous voicing into account. The current solver remains the fallback for unsupported chords.
- Guitar performer: a chord expands to one note per sounding string. Down strums play low to high, up strums high to low. The strum spreads over `strumMs` with seeded, order-preserving jitter. A new chord chokes the previous chord's strings ("tight" mode); "natural" mode adds a short overlap. Muted and palm-muted strokes use short envelopes, filtered from the same samples until dedicated samples exist.
- The existing synth guitar presets remain as Classic. Existing chord events play on the new guitar only when the channel's sound is switched to it.
- Acceptance: run the listening set from the original section 43 on the old and new guitar, with consistent output level. Every chord in the dictionary resolves. The same seed produces identical WAV exports.

### E4. Guitar patterns and chord-track UI
- Strum pattern presets as data: straight quarters, straight eighths, pop, folk, rock, ballad, reggae offbeat, power chords, arpeggio up and arpeggio up/down.
- On a guitar channel: a chord row (`Am | F | C | G`) with Pattern, Strum speed and Humanise controls, per the `skill.md` layout rules.
- Advanced view (voicing and fretboard preview, per-stroke accent and direction, capo) is hidden behind a toggle.
- Patterns compile to chord events, so they appear in the existing grid and piano roll, and they survive project save and load.
- Acceptance: a full accompaniment from four chord symbols and one preset at 320–430px width; tempo changes keep patterns aligned.

### E5. More sampled instruments
- Priority: piano (a Salamander Grand subset, CC-BY 3.0, with attribution shown in Settings › About), bass guitar (source still to be found, see section 5), strings and brass (VCSL, CC0, or University of Iowa MIS, which allows use "for any projects, without restrictions"), then electric piano and an electric guitar.
- Each instrument goes through a proof set first (one octave, or a few notes) to check noise floor, looping, level and size.
- Loudness matching: each manifest has a gain offset so sampled and Classic sounds sit at similar perceived levels.
- Per-track send effects only if they're actually needed after listening.

### E6. Personal instruments and personal guitar
- Build on the Sample editor: "Make instrument from samples". Assign one or more saved samples to root notes (using detected pitch), set a safe range, and the manifest is generated in IndexedDB.
- Coverage view for guitars: string × fret grid showing recorded, inherited and missing. Missing regions inherit from the selected factory guitar. A/B against the factory sample.
- Re-recording one region updates only that region.

### E7. Recorded chords (Path A, hybrid)
- Sources: your own recordings (guided capture of about 8–12 common open chords, down and up, one velocity), or a local pack.
- Lookup order: exact chord, voicing, direction and articulation; then closest compatible; then the constructed path (E3). There is no double trigger when switching paths mid-pattern.
- Developer diagnostics show which path played each chord.

### E8. Hardening
- Profile on your actual phone and laptop: load time, decoded memory, first-note latency, voices under UI load, and loop recovery. Set final budgets from these measurements.
- Regression projects (one per instrument family) with stored reference WAV hashes.
- Clear messages for a missing pack, a corrupt file, an unsupported chord and a suspended audio context. Test iOS audio unlock after the app has been backgrounded.
- Document asset provenance and backup in `docs/instruments.md`.

### Deferred
Tempo map and tempo automation, seek, AudioWorklet, Tone.js, cloud rendering, stem separation and song-to-MIDI, marketplace and sharing. Let-ring string tracking across chords is deferred until after E4.

---

## 5. Assets and licences

Rule: every bundled instrument has a `LICENCE.txt` and a manifest `provenance` block (source, URL, creator, licence, date, redistribution allowed, modification allowed, local processing). Anything not redistributable is a local pack only.

| Need | Candidate | Licence (checked 2026-10-30) | Notes |
|---|---|---|---|
| Nylon guitar | FreePats Nylon-String Acoustic Guitar | CC0 1.0 | Small (about 7 MB as WAV). Layer and string coverage still needs inspecting. |
| Steel-string guitar | FreePats Steel-String Acoustic Guitar | GPL-3+ with FreePats exception | About 13 MB as WAV. Confirm the exception covers bundling in a public web app. |
| Orchestral, keys, percussion | VCSL (Versilian Community Sample Library) | CC0 1.0 | About 20–75 MB raw per instrument, so a subset is needed. |
| Strings, winds, brass, some guitar and piano | University of Iowa MIS | "any projects, without restrictions" | Anechoic and dry, so it needs reverb. No bass guitar. |
| Piano | Salamander Grand Piano | CC-BY 3.0 | 16 layers, sampled every minor third. Ship 2–3 layers. Attribution required. |
| Drum kit | To be selected in E2 | Must be CC0 or CC-BY | No candidate verified yet. |
| Bass guitar, electric guitar | Not found yet | — | Options: keep searching in E5, record your own (E6), or use a local pack. |
| Strummed chord recordings | None redistributable found | — | Your own recordings or a local pack (E7). |

Hosting: GitHub Pages allows a published site of up to 1 GB and a soft 100 GB/month of bandwidth. Keep the bundled instruments under about 150 MB in total.

---

## 6. Definition of done (revised)
- Guitar channels can use real samples with strummed, string-accurate voicings. Synth guitars remain available as Classic.
- Drums, guitar, piano and at least one bass instrument are sample-based.
- Playback and WAV export render the same VoiceEvents and match.
- New instruments are added through a manifest only, with no engine changes.
- Old projects open and sound unchanged until you switch an instrument.
- Personal samples can extend or replace factory regions gradually.
- Measured memory stays within budget on your phone through a 5-minute session.

## 7. Decisions
1. First guitar: **nylon** (decided 2026-10-30).
2. CC-BY attribution line in Settings › About for the Salamander piano: **accepted** (2026-10-30).
   The repo stays public (decided 2026-10-30), so bundled samples must be redistributable.
3. About 150 MB total download, fetched per instrument on demand: **accepted**.
4. Personal guitar capture (E6) and recorded chords (E7): **kept as optional features**. Nothing in E0–E5 depends on you recording anything.
