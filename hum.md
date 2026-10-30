# MusicMaker Hum-to-Music Plan (v2)

Status: **Adopted 2026-10-30.** This revises Marko's `hum.md` (2026-10-30). It is the **product goal**; `expansion.md` (sampled instruments, guitar engine) is the sound engine that serves it. The combined build order is tracked in `plan.md`.

---

## 1. Goal

MusicMaker is for someone who hears music in their head but doesn't play an instrument or know theory:

**Capture an idea → hear it as real instruments → choose by ear → add parts → arrange.**

Promise: *if you can hum it, tap it or draw it, MusicMaker turns it into editable music, and you can always go back to what you performed.*

### Principles (kept from the original, tightened)
1. **Ears before theory.** The basic UI uses Higher/Lower, Original/Cleaned/Tight, Simple/Fuller and instrument names. Note names, keys and grids live in advanced views (the existing piano roll and Song tools).
2. **The original is sacred.** Every capture keeps its audio, the raw detection, the corrected version, and what was derived from it. Re-analysis or correction never overwrites the raw result. *Already true in code* (`RecognitionTake.originalEvents` / `quantisedEvents`, original audio in IndexedDB).
3. **Transcription, correction and creation stay separate.** What you performed, what was corrected, and what was generated around it are separate tracks with provenance. *Already true for generated tracks* (`generatedMetadata`).
4. **Choose by listening.** Offer 2–3 playable alternatives with Play and Use, rather than settings.
5. **Humming and hand editing are equal and linked.** The grid, piano roll, samples and sound designer remain a full way to make music. Capture is another way in, not a replacement. Hummed material lands as ordinary notes and steps you can edit; grid edits always win over later corrections; you can hum onto a track you choose; and you can always hear what you sang next to the notes.
6. **Labels and values only.** The original's on-screen sentences ("We found a few ways to accompany your melody…") become short labels, per the app's UI rule. For example: `Chords  A ▶ Use  B ▶ Use  C ▶ Use`.

---

## 2. Review of the original `hum.md`

**What it gets right:** the user focus, the four-layer preservation model, choice by ear, rhythm as a reusable object (tap once, use for drums, bass or strum), typed operations for any language-driven editing, analysis behind replaceable interfaces, and the build-order priority (get the idea out first).

| # | Issue | Why it matters | Change |
|---|---|---|---|
| 1 | Written as if nothing exists | Recognition (Phase 10) and arrangement assistance (Phase 11) already cover a large part of H2–H5 and H10: on-device melody, bass and beatbox recognition, original audio kept, timing and pitch correction, count-in, metronome, overdub playback, chord suggestion, and bass/harmony/accompaniment generation as separate tracks. | Build on these (section 3). |
| 2 | New parallel data models (`CapturedIdea`, `CapturedMelody`, `CapturedNote`, `DrumEvent`) | `RecognitionTake` already stores source audio, raw and corrected events, mode, tempo, corrections and derived channel ids. Two models would drift apart. | Extend `RecognitionTake` into the "idea" record (role, source type, label, parent) instead of adding a second model. |
| 3 | "Basic Pitch already identified" | Basic Pitch is not bundled. The shipped engine is a local YIN pitch tracker behind `PitchRecognitionEngine`. | Keep YIN as default. Add a test set of hummed phrases with known notes, and adopt a stronger engine only if it measurably wins on that set and fits the size budget. |
| 4 | Capture-first home screen replaces the current layout | The app has four tabs with Beat as home. Replacing the home screen is a big redesign for an uncertain gain. | Add an always-visible **Capture** button in the header next to Play, which opens a capture sheet. The four tabs stay. Ideas are listed in Library. |
| 5 | Automatic detection of what was recorded | Reliably telling melody, bass and beat apart is hard. A wrong guess is worse than asking. | After recording, show Melody / Bass / Beat with a pre-selected guess from simple features (pitch stability, onsets, register). One tap confirms. |
| 6 | No channel budget | The cap is 8 channels. Today a beatbox take uses one channel per drum class plus a muted channel for the original, so one take can use up to 9. Layering melody, bass, drums, chords and harmony runs out immediately. | (a) Drum takes go into one **kit channel with lanes** (built in E2). (b) The original recording becomes a play-original toggle on the track, not its own channel. (c) Raise the cap to 12 after measuring on the phone. |
| 7 | Overdub timing | Recording starts the project and the recorder separately, with no latency compensation, so recorded layers land late. The metronome runs on its own timer. | Measure round-trip latency once (a loopback click, or the browser's reported output latency) and shift captured events to match. Run the click on the engine's clock. |
| 8 | Not mentioned: microphone processing | `getUserMedia({audio: true})` turns on noise suppression and automatic gain by default. Both distort humming and hurt pitch tracking. | Request `noiseSuppression: false, autoGainControl: false`. Keep echo cancellation on only when monitoring through speakers. Prompt for headphones when overdubbing. |
| 9 | **Bug found during the audit:** recording changes the project's loop length to the recording length (`setLoopBars`), which permanently deletes steps, notes and chords beyond it in the current pattern. | Data loss in the exact workflow this plan is built on. | Fix first (H0): recording must not truncate the project. Record length only sets how long to record. |
| 10 | Chords by ear | Today's suggestion assumes the project's scale setting is right (a non-musician won't set it), picks one chord per bar, and offers per-bar alternatives rather than whole-progression alternatives. "Preview" only lists note names as text; nothing plays. | Detect the key from the melody, generate 3 whole progressions (Simple / Different / Colour), and make every alternative playable with the melody before Use. |
| 11 | Recognised and generated tracks get synth sounds (`keys-1`, `bass-6`, synth drums) | This undermines "hear it as real instruments". | Once sampled instruments exist, recognised melody defaults to piano, bass to sampled bass, beat to the sampled kit, and chords to nylon guitar. A **Hear as** row switches instrument without re-analysis. |
| 12 | Cleaned mode and glide notes | In the audit test, a hummed C D E G E D C C came back as C D E G **F** E D **C#** C: short glide notes between pitches. | "Cleaned" merges or removes notes shorter than a threshold that sit between neighbouring pitches. "Tight" also snaps to the detected key and grid. |
| 13 | Plain-language editing needs a language model | The app is fully local with no server and no API key. It also has no project-level undo yet. | First add project undo (H0). Plain-language editing comes last, behind a decision about which model to use (e.g. your own API key), and works only through typed, previewed, undoable operations. |
| 14 | "Suggest what comes next" needs a generative model | No model is available offline. | v1 is deterministic: repeat, move up or down, invert, vary the rhythm, answer phrase. 3 alternatives, seeded, provenance kept. |
| 15 | Reference audio and stem separation | Heavy models, licensing questions, and no need yet. | Deferred. |
| 16 | New `src/audio/capture`, `analysis`, `interpretation`… folder tree | Responsibilities already live in `src/library` (recognition, chords, arrangement) and `src/model`. | Add modules in place. No reorganisation. |

---

## 3. What exists, what to adjust, what to build

| Capability | Status | In code today | Gap |
|---|---|---|---|
| Record or import, keeping the original | **Built** | Sample editor: mic or file, original kept in IndexedDB, count-in, metronome, record length | Mic constraints (#8), loop-length bug (#9), latency (#7) |
| Hum, sing or whistle → melody | **Built (basic)** | YIN tracker, confidence, pitch bends, Melody/Bass modes, timing and pitch correction, scale snap, transpose, event editing, restore | Glide cleanup (#12); one Original/Cleaned/Tight control; test set (#3) |
| One-step capture | **Missing** | Four steps today: record → save → open Recognition → choose sample → Recognize | Capture button and sheet (#4, #5) |
| Hear as instrument | **Partial** | Recognised notes play on synth sounds | Sampled defaults and a Hear-as row (#11), once E2–E5 instruments exist |
| Hum → bass | **Built (basic)** | Bass mode (low register) | Overdub flow with latency fix and headphone prompt |
| Beatbox → drums | **Built (basic)** | Onset detection, rule-based classes (kick, snare, hats, clap, tom, cymbal), per-event reclassify, timing strength | One kit channel with lanes (#6); Mine/Tighter/Grid control; sampled kit |
| Tap → rhythm | **Missing** | — | Tap pad producing a reusable rhythm pattern for drums, bass, strum or pulses |
| Melody → chords | **Partial** | Per-bar chord suggestion with alternatives, scale-aware; chord tracks | Key detection, 3 progression alternatives, audible audition (#10) |
| Chord accompaniment | **Partial** | Accompaniment styles (Acoustic, Pop, Electronic, Orchestral), separate tracks | Realistic guitar (E3–E4), piano and strings (E5) |
| Harmony voice | **Built (basic)** | Scale-aware harmony generation, separate track | Subtle/Warm/Wide presets with audition |
| Layering | **Partial** | Overdub playback during recording, layered takes | Add-part menu, latency, channel budget, play-original toggle |
| Draw a melody | **Missing** | Piano roll for manual entry only | Contour canvas → notes → audition |
| Arrangement builder | **Partial** | Patterns, launcher, timeline | Section templates, density, preview before commit |
| Suggest next phrase | **Missing** | — | Deterministic variations (#14) |
| Hum, then edit on the grid | **Partial → fixed in H0** | Recognised notes and steps are ordinary grid content with provenance and confidence cues | Corrections used to rebuild the track and wipe grid edits; now edits are kept. Still to do: capture into a chosen track, play-what-I-sang toggle (H1) |
| Undo / idea history | **Partial** | Undo inside the Sample editor and Recognition only | Project-level undo for capture, generation and arrangement |
| Find the sound in my head | **Missing** | Tags exist on samples | Tags on instrument manifests; audition with your own phrase |
| Plain-language edits | **Missing** | — | Last; needs a model decision (#13) |

**Regression check (2026-10-30):** the UI reorganisation, E0 and E1 did not break recognition. In the audit, a hummed-style file was imported, saved, recognised into a melody track with its original kept, with no errors. But the UI change hid Recognition in the third collapsed Library section, and the project plans no longer named this use case. Both are corrected by this plan.

---

## 4. Phases (H), interleaved with the engine phases (E) in `plan.md`

### H0. Safety and foundations
- ✅ Recording no longer changes or truncates the project loop (#9). Applying a take only grows the loop to fit it. Tests and a browser check.
- ✅ Grid edits survive corrections: re-applying a take (timing, pitch, tempo, event edits) updates its tracks in place. Notes and hits the user moved, added or deleted are kept (tracked by event identity), and the track's sound, volume, pan and mute stay. "Reset track" discards edits to recognised notes on request; notes the user added are never removed. Older projects keep working: their current grid counts as unedited.
- Mic constraints for capture (#8). Latency measurement and alignment of captured events (#7). Click on the engine clock.
- Project-level undo and redo (snapshot history of the project document, capped) for capture, recognition apply, generation, kit apply and arrangement. Before any generative feature.
- The idea record: `RecognitionTake` gains `role`, `source` (mic, import, tap, draw) and `label`. A migration test covers it.
- Done when: recording over a 4-bar project keeps all its content; captured notes line up with the grid within a measured tolerance; any capture or generation can be undone.

### H1. Capture
- Header **Capture** button opens a sheet: record (count-in optional), stop, then Melody / Bass / Beat with a pre-selected guess, then recognise and apply in one go. The original is stored before analysis, so a failed analysis never loses the idea.
- **Capture into:** New track, or the selected channel (its notes and samples stay; hummed notes are added alongside, with provenance).
- **Play what I sang:** a toggle on any hummed track that plays the original recording with the notes, for comparing by ear while editing. It replaces the separate muted Original channel.
- Performance control **Original / Cleaned / Tight** maps onto the existing timing and pitch settings, with glide cleanup (#12). The existing detailed controls stay as the advanced view.
- Library's Recognition section becomes **Ideas**: a list of takes with Play original, Play result, Hear as, Delete.
- Done when: from launch, an idea is captured and playing as a track in 3 taps; the C D E G test phrase comes back without glide notes in Cleaned mode.

### H2. Hear as real instruments (needs E3 and E5a)
- ✅ Recognised melody defaults to sampled piano, bass to sampled bass, beat to the sampled kit. A **Hear as** row on the track (Piano, Guitar, Bass, Strings, Synth) switches instrument without re-analysis.

### H3. Chords by ear ✅
- Key detection from melody pitch classes (with a confidence; the scale setting is only a fallback).
- 3 whole-progression alternatives (Simple / Different / Colour), scored on strong-beat chord tones, smoothness and repetition, with an optional half-bar rhythm.
- Each alternative plays with the melody on the chosen accompaniment (guitar through the guitar engine, piano or strings through the sampler) before Use. "Use" creates a separate chord track.

### H4. Layering, hum bass and beatbox kit
- **Add part**: Hum melody, Hum bass, Beatbox, Tap rhythm, Chords, Harmony. Overdub loops the project, prompts for headphones, and applies latency alignment.
- Beatbox takes write into one kit channel with lanes (from E2), including an existing kit channel the user chose, keeping its programmed steps. Timing control Mine / Tighter / Grid. Tap a hit to reclassify.
- Overdubs are recorded against the grid loop that is playing, so they land in time with what was programmed (needs the H0 latency alignment).
- The original recording becomes a play-original toggle on the track. Raise the channel cap after measuring.

### H5. Tap rhythm and draw melody
- Tap pad: record taps, store them as a rhythm pattern (beats and strengths), then "Use for" Drums, Bass, Strum (E4) or Pulses.
- Draw pad: contour → smoothed segments → notes snapped by Original/Cleaned/Tight → audition. Higher/Lower nudges per note.

### H6. Harmony presets and next phrase
- Harmony: Subtle / Warm / Wide presets over the existing generator, auditioned, as a separate track.
- Next phrase: 3 deterministic variations of the selected phrase, seeded, marked as generated.

### H7. Arrangement builder
- Section templates (Short idea, Loop, Full song: Intro, Verse, Chorus…) built from existing patterns. Density per section (Smaller/Bigger, More/Fewer instruments). Preview before commit; undoable.

### H8. Find the sound
- Description tags on instrument manifests (Warm, Bright, Dark, Soft, Acoustic, Electronic…). Rank instruments by tags and audition them playing your own phrase.

### Deferred
- Plain-language editing: needs a model decision and project undo first. Typed operations only.
- Reference audio and stem separation.
- Automatic detection without confirmation.

---

## 5. Definition of done
Someone who can't play an instrument can:
1. Hum or whistle a melody with one Capture action and hear it played back as a real instrument.
2. Fix it by listening (Original / Cleaned / Tight, Higher / Lower), not by notation.
3. Hum a bass line over it, aligned in time.
4. Beatbox or tap a rhythm into a sampled kit.
5. Hear three chord accompaniments under the melody and pick one by ear.
6. Hear the chords played as a realistic guitar, piano or strings.
7. Keep adding layers while the music loops.
8. Expand the sketch into sections.
9. Always play the original recording, and tell performed material from generated material.
10. Undo any capture or generation step.
