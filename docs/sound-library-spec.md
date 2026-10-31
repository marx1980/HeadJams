# MusicMaker Sound Library Expansion Plan

> **Historical document.** Kept for reference; parts are out of date. Current plan: `plan.md`. Current UI rules: `skill.md`.

## Objective

Expand MusicMaker's Sound Library with a broader range of melodic instruments, guitar note and chord modes, drum sounds, percussion, and ready-made kits. Replace flat sound dropdowns with a hierarchical picker that remains easy to navigate as the library grows.

## Product principles

- Keep the first view simple by showing sound groups rather than every sound.
- Allow users to preview a sound before selecting it.
- Distinguish pitched instruments, chord instruments, and percussion sounds internally.
- Preserve all existing sounds and existing projects.
- Build the library from structured data rather than hard-coded menus.
- Allow new instruments and samples to be added without redesigning the interface.
- Keep advanced articulation controls out of the first expansion unless required for guitar chords.

---

## 1. Hierarchical Sound Library

Replace each flat sound dropdown with a hierarchical picker.

### Top-level groups

```text
Sound Library
├─ Favourites
├─ Recent
├─ Keys
├─ Guitars
├─ Strings
├─ Brass & Winds
├─ Synths
├─ Bass
├─ Drums
├─ Percussion
└─ FX & Other
```

### Picker behaviour

1. The first screen displays only top-level groups.
2. Selecting a group opens its subgroups and sounds.
3. A back control returns to the previous level.
4. Tapping a sound previews it without closing the picker.
5. A separate Select action confirms the choice, or a second tap selects it.
6. The current sound is clearly marked.
7. Recently used and favourite sounds appear above the main groups.
8. The same picker component is used wherever MusicMaker currently displays a sound dropdown.

### Mobile requirements

- Use a full-width bottom sheet or full-screen picker on small screens.
- Keep touch targets large enough for comfortable phone use.
- Keep the group and sound names visible without horizontal scrolling.
- Use icons and colour accents to distinguish instrument families.
- Do not display all nested options simultaneously on a small screen.

---

## 2. Sound types and playback modes

Use **Sound Library** as the user-facing umbrella term, but distinguish three types internally.

### Pitched instrument

Receives individual note events containing pitch, start time, duration, and velocity.

Examples:

- Piano
- Violin
- Flute
- Electric bass
- Guitar note mode

### Chord instrument

Receives a chord event or chord symbol and plays an appropriate voicing or chord sample.

Examples:

- Acoustic guitar chord
- Clean electric guitar chord
- Power chord
- Future chord-based pads

### Percussion sound

Receives timed one-shot hits without a required melodic pitch.

Examples:

- Kick
- Snare
- Hi-hat
- Clap
- Conga

---

## 3. Guitar expansion

Guitars must support both individual notes and chords.

### Guitar hierarchy

```text
Guitars
├─ Acoustic
│  ├─ Nylon Guitar
│  ├─ Steel Guitar
│  ├─ Muted Acoustic
│  └─ Acoustic Harmonics
├─ Electric
│  ├─ Clean Electric
│  ├─ Jazz Electric
│  ├─ Crunch Guitar
│  ├─ Distorted Guitar
│  └─ Muted Electric
└─ Chords
   ├─ Acoustic Chord
   ├─ Clean Electric Chord
   ├─ Crunch Chord
   └─ Distorted Power Chord
```

### Note mode

Individual notes from the piano roll trigger playable guitar notes.

Use cases:

- Melodies
- Riffs
- Solos
- Arpeggios
- Repeating note patterns

### Chord mode

Chord events trigger guitar-appropriate voicings rather than simply stacking generic MIDI notes.

Initial chord articulations:

- Sustained chord
- Down strum
- Up strum
- Muted chord
- Power chord where supported

### Chord behaviour

- Support major, minor, diminished, augmented, suspended, seventh, major seventh, and minor seventh chords where available.
- Keep chord names visible in the editor.
- Use playable guitar voicings within a realistic range.
- Provide a fallback generated voicing if a dedicated sample is unavailable.
- Do not silently replace an unsupported chord with a different chord.

---

## 4. Keys

```text
Keys
├─ Piano
│  ├─ Grand Piano
│  ├─ Bright Piano
│  ├─ Mellow Piano
│  └─ Upright Piano
├─ Electric Piano
│  ├─ Rhodes-style Electric Piano
│  ├─ Wurlitzer-style Electric Piano
│  └─ Digital Electric Piano
└─ Other Keys
   ├─ Organ
   ├─ Hammond-style Organ
   ├─ Clavinet
   ├─ Harpsichord
   ├─ Celesta
   └─ Music Box
```

All Keys sounds initially use pitched-note playback.

---

## 5. Strings

```text
Strings
├─ Solo
│  ├─ Violin
│  ├─ Viola
│  ├─ Cello
│  └─ Double Bass
└─ Ensemble
   ├─ String Ensemble
   ├─ Chamber Strings
   ├─ Pizzicato Strings
   └─ Tremolo Strings
```

Treat sustained, pizzicato, and tremolo as separate sounds initially. A unified articulation selector can be considered later.

---

## 6. Bass

Keep Bass as a dedicated group rather than placing it under Guitars.

```text
Bass
├─ Acoustic
│  └─ Upright Bass
├─ Electric
│  ├─ Finger Bass
│  ├─ Pick Bass
│  ├─ Slap Bass
│  └─ Fretless Bass
└─ Synth
   ├─ Sub Bass
   ├─ Analog Bass
   ├─ Synth Bass
   └─ Acid Bass
```

These sounds should work with MusicMaker's hum-a-bass-line workflow and standard piano-roll input.

---

## 7. Synths

Organise synthesiser presets by musical function rather than technology or brand.

```text
Synths
├─ Lead
│  ├─ Analog Lead
│  ├─ Soft Lead
│  └─ Digital Lead
├─ Pad
│  ├─ Warm Pad
│  ├─ Air Pad
│  ├─ Dark Pad
│  └─ Strings Pad
├─ Pluck
│  ├─ Soft Pluck
│  ├─ Bright Pluck
│  └─ Synth Pluck
└─ Keys
   ├─ Analog Keys
   └─ Digital Keys
```

Avoid adding excessive presets until the picker, preview, and loading performance have been validated.

---

## 8. Brass and Winds

```text
Brass & Winds
├─ Brass
│  ├─ Trumpet
│  ├─ Trombone
│  ├─ French Horn
│  └─ Brass Ensemble
├─ Woodwind
│  ├─ Flute
│  ├─ Clarinet
│  ├─ Oboe
│  └─ Bassoon
└─ Saxophone
   ├─ Alto Saxophone
   ├─ Tenor Saxophone
   └─ Baritone Saxophone
```

The complete hierarchy can be implemented before every sound is available. Unavailable sounds should not appear as active selectable options.

---

## 9. Drum expansion

Expand Beat beyond a single kick, snare, and hi-hat set.

```text
Drums
├─ Kick
│  ├─ Acoustic Kick
│  ├─ Deep Kick
│  ├─ Punchy Kick
│  ├─ Electronic Kick
│  └─ 808 Kick
├─ Snare
│  ├─ Acoustic Snare
│  ├─ Tight Snare
│  ├─ Deep Snare
│  ├─ Electronic Snare
│  └─ Rimshot
├─ Hi-Hat
│  ├─ Closed Hi-Hat
│  ├─ Open Hi-Hat
│  ├─ Pedal Hi-Hat
│  └─ Electronic Hi-Hat
├─ Cymbal
│  ├─ Crash
│  ├─ Ride
│  ├─ Splash
│  └─ China
├─ Toms
│  ├─ High Tom
│  ├─ Mid Tom
│  ├─ Low Tom
│  └─ Floor Tom
└─ Clap
   ├─ Hand Clap
   ├─ Layered Clap
   └─ Electronic Clap
```

### Beat editor requirements

- Each Beat channel can select its own sound through the hierarchical picker.
- Replacing a sound must preserve the existing pattern.
- Users can preview sounds without changing the assigned sound.
- Sound names should remain readable in each channel.
- Existing kick, snare, and hi-hat projects must continue to load correctly.

---

## 10. Percussion expansion

Keep acoustic and world percussion separate from the main Drum group.

```text
Percussion
├─ Hand Percussion
│  ├─ Conga
│  ├─ Bongo
│  ├─ Cajón
│  ├─ Djembe
│  └─ Tabla
├─ Shakers
│  ├─ Shaker
│  ├─ Maraca
│  └─ Tambourine
├─ Auxiliary
│  ├─ Cowbell
│  ├─ Claves
│  ├─ Woodblock
│  ├─ Triangle
│  └─ Guiro
└─ World
   ├─ Timbales
   ├─ Agogô
   └─ Cabasa
```

---

## 11. Drum kits

Offer complete kits in addition to individual sounds.

```text
Drum Kits
├─ Acoustic
│  ├─ Studio Kit
│  ├─ Rock Kit
│  └─ Jazz Kit
├─ Electronic
│  ├─ 808 Kit
│  ├─ 909-style Kit
│  ├─ House Kit
│  └─ Electronic Kit
└─ Other
   ├─ Lo-Fi Kit
   ├─ Hip-Hop Kit
   └─ Percussion Kit
```

### Kit behaviour

- Selecting a kit replaces the compatible kick, snare, hi-hat, tom, cymbal, and clap assignments together.
- Existing Beat patterns must remain unchanged.
- Users can override any individual channel after applying a kit.
- Show a confirmation only if applying a kit would overwrite customised sound assignments.
- Allow full-kit preview where practical.

---

## 12. Favourites, recent sounds, search, and preview

### Favourites

- Users can add or remove a sound from Favourites.
- Favourites appear at the top of the picker.
- Store favourites per user or locally if accounts are not yet implemented.

### Recent

- Show recently selected sounds.
- Keep the list short and deduplicated.
- Selecting a recent sound uses the same validation and loading logic as selecting it from its group.

### Search

- Search by display name and tags.
- Search results should include the sound's category path.
- Example: `Clean Electric — Guitars > Electric`.

### Preview

- Pitched instruments play a short representative phrase or note.
- Chord instruments play a representative chord or strum.
- Percussion sounds play one hit.
- Kits play a short representative beat.
- Starting a new preview stops the previous preview.
- Preview must not change the project or add events.

---

## 13. Instrument registry

Do not hard-code the library hierarchy directly into UI components. Create a central registry that drives menus, search, previews, validation, loading, and project persistence.

Suggested fields:

```ts
type SoundType = 'pitched' | 'chord' | 'percussion' | 'kit';
type PlaybackMode = 'notes' | 'chord' | 'one-shot' | 'kit';

interface SoundDefinition {
  id: string;
  name: string;
  group: string;
  subgroup?: string;
  type: SoundType;
  playbackMode: PlaybackMode;
  source: string;
  previewSource?: string;
  icon?: string;
  tags: string[];
  version: number;
  available: boolean;
}
```

Examples:

```ts
{
  id: 'clean-electric-guitar',
  name: 'Clean Electric',
  group: 'Guitars',
  subgroup: 'Electric',
  type: 'pitched',
  playbackMode: 'notes',
  source: '...',
  tags: ['guitar', 'electric', 'clean'],
  version: 1,
  available: true
}
```

```ts
{
  id: 'acoustic-guitar-chord',
  name: 'Acoustic Chord',
  group: 'Guitars',
  subgroup: 'Chords',
  type: 'chord',
  playbackMode: 'chord',
  source: '...',
  tags: ['guitar', 'acoustic', 'chord', 'strum'],
  version: 1,
  available: true
}
```

```ts
{
  id: 'deep-kick',
  name: 'Deep Kick',
  group: 'Drums',
  subgroup: 'Kick',
  type: 'percussion',
  playbackMode: 'one-shot',
  source: '...',
  tags: ['drum', 'kick', 'deep'],
  version: 1,
  available: true
}
```

### Registry requirements

- IDs must be stable and must not depend on display names.
- Renaming a sound must not break saved projects.
- The registry must validate duplicate IDs and missing assets.
- The UI should hide unavailable entries by default.
- Existing sound IDs should be migrated or mapped to the new registry.
- The project file should store the stable sound ID, not the menu path.

---

## 14. Asset and performance requirements

- Use only sound assets with confirmed redistribution rights.
- Record the licence and attribution requirements for every asset source.
- Do not load the entire sound library at application start.
- Load sounds on demand and cache recently used assets.
- Display a loading state when an instrument is not yet available locally.
- Compress assets without introducing obvious loops, clicks, or excessive quality loss.
- Normalise levels so switching instruments does not create extreme loudness changes.
- Trim silence around one-shot sounds.
- Ensure pitched samples loop cleanly where sustained playback is required.
- Avoid duplicate assets across instruments and kits where the same source can be reused.

---

## 15. Backwards compatibility

- Existing projects must load with their original sounds or an explicitly mapped equivalent.
- Existing Beat channel assignments and patterns must remain intact.
- Existing Sound Library selections must be migrated to stable registry IDs.
- If an old sound is unavailable, show a clear missing-sound state and allow replacement.
- Do not silently replace missing sounds without informing the user.
- Saving an upgraded project should use the new format while retaining project content.

---

## 16. Mic Sample Editing & Enhancement

Expand the current mic-recording workflow beyond Trim and Normalise so recordings added to the Sample Library can be cleaned, corrected, transformed, and prepared for musical use directly inside MusicMaker.

### Editing principles

- Keep the original recording unchanged and apply edits non-destructively.
- Allow users to preview the processed and original versions instantly.
- Provide one-tap sensible defaults while keeping advanced controls optional.
- Make Undo/Redo available for all sample edits.
- Allow Reset to Original at any time.
- Save processing settings with the sample so edits can be changed later.
- Render/cache a processed version for fast playback after settings change.

### Core cleanup tools

Add these controls alongside the existing Trim and Normalise tools:

**Noise Reduction**
- Reduce steady background noise such as room hiss, fan noise, and microphone noise.
- Provide simple Low / Medium / High reduction presets plus an optional strength slider.
- Avoid aggressive settings that create metallic or watery artefacts.

**Noise Gate / Silence Cleanup**
- Suppress low-level noise between notes or drum hits.
- Adjustable threshold.
- Optional automatic removal of silence before and after the useful recording.

**De-click / Pop Reduction**
- Reduce short clicks and handling noises.
- Provide a simple automatic mode rather than exposing complex parameters initially.

**Fade In / Fade Out**
- Add short fades to prevent clicks at trimmed sample boundaries.
- Allow manual fade length when needed.

**Normalisation / Gain**
- Keep the existing Normalise function.
- Add manual gain adjustment before or after normalisation.
- Prevent accidental clipping and show clipping clearly in the waveform.

### Pitch tools

**Pitch Shift**
- Shift a recording up or down in semitones without intentionally changing its duration.
- Provide octave shortcuts: -12 and +12 semitones.
- Allow fine tuning in cents for recorded samples that are slightly out of tune.
- Include Reset to original pitch.

**Tune to Note**
- Detect the dominant/fundamental pitch of suitable monophonic recordings.
- Display the detected note and tuning offset.
- Offer one-tap tuning to the nearest note.
- Allow the user to choose a different target note if detection is wrong.
- Do not force pitch detection or tuning on percussion/noise samples.

### Time and speed tools

**Speed**
- Change playback speed with the traditional linked effect: faster raises pitch and shorter duration; slower lowers pitch and increases duration.
- Include useful quick settings such as 0.5x, 0.75x, 1x, 1.25x, 1.5x, and 2x.

**Time Stretch**
- Change duration/tempo while retaining approximately the original pitch.
- Allow percentage and musical/BPM-based adjustment where BPM is known.
- Provide Fit to Beat / Fit to Bar options for rhythmic samples once the project tempo is available.

**Reverse**
- Reverse a sample non-destructively.
- Useful for cymbals, effects, vocal fragments, and experimental sounds.

### Tone shaping

**EQ**
Start with a simple three-band control:
- Bass / Low
- Mid
- Treble / High

Later allow an advanced parametric EQ if there is demonstrated need.

**High-pass filter**
- Provide a quick way to remove low-frequency rumble from voice and instrument recordings.

**Compression**
- Reduce excessive dynamic differences and make quiet/loud parts more consistent.
- Start with Off / Gentle / Strong presets rather than requiring compressor expertise.

### Optional creative processing

Add after the cleanup and transformation tools are stable:

- Reverb
- Delay / Echo
- Distortion / Saturation
- Low-pass / High-pass filter effects
- Chorus
- Bitcrusher / Lo-fi effect

Treat these as creative effects, visually separated from corrective tools such as Noise Reduction and Normalisation.

### Proposed Sample Editor layout

```text
Sample Editor

[ waveform with draggable start/end handles ]

CLEAN
Trim | Normalise | Noise Reduce | Gate | Fade

TUNE
Pitch | Fine Tune | Tune to Note

TIME
Speed | Stretch | Reverse | Fit to Beat

TONE
EQ | Filter | Compression

FX
Reverb | Delay | Distortion | Lo-fi

[Compare Original]   [Reset]   [Save]
```

On phones, show the tool families first and reveal controls only after a family/tool is selected rather than presenting every slider simultaneously.

### Processing chain

Use a defined processing order so combinations remain predictable. A sensible initial chain is:

```text
Original recording
→ Trim / fades
→ Noise reduction / gate
→ Pitch and time processing
→ EQ / filtering
→ Compression / gain
→ Creative effects
→ Normalisation / output safety
→ Cached playback version
```

The architecture should allow this order to evolve without modifying the original source recording.

### Sample metadata

Extend saved mic samples with metadata such as:

```text
id
name
originalSource
processedSource
duration
recordedAt
detectedPitch
targetPitch
detectedBpm
processingSettings
version
```

Store processing parameters rather than destructively overwriting the only copy of the audio.

### Recommended implementation order

**Sample Editing Phase 1: Essential cleanup**
- Existing Trim
- Existing Normalise
- Noise Reduction
- Noise Gate
- Fade In / Out
- Manual Gain
- Original vs Processed preview
- Undo / Reset

**Sample Editing Phase 2: Musical transformation**
- Pitch Shift
- Fine Tune
- Tune to Note
- Speed
- Time Stretch
- Reverse

**Sample Editing Phase 3: Musical timing**
- BPM detection for appropriate samples
- Fit to Beat
- Fit to Bar
- Project-tempo-aware stretching

**Sample Editing Phase 4: Sound shaping**
- Three-band EQ
- High-pass filter
- Compression presets

**Sample Editing Phase 5: Creative effects**
- Reverb
- Delay
- Distortion / Saturation
- Chorus
- Lo-fi / Bitcrusher

### Sample editor testing

Test with several input types:

- Hummed sustained note
- Sung melodic fragment
- Beatbox kick/snare/hat sounds
- Hand clap
- Acoustic instrument recording
- Quiet microphone recording
- Recording with steady background noise
- Recording with leading/trailing silence

Verify that:

- Processing never destroys the original recording.
- Noise Reduction improves noisy samples without making clean samples noticeably worse at default settings.
- Pitch Shift and Time Stretch can be adjusted independently.
- Speed mode changes duration and pitch together as expected.
- Trimming and fades do not introduce audible clicks.
- Processed samples play correctly in Beat and melodic/sample contexts.
- Saving and reopening a project preserves processing settings.
- Reset restores the original recording and settings.
- Mobile editing remains responsive with representative sample lengths.

---

## 17. Audio-to-Instruments Recognition Roadmap

### Objective

Allow a user to sing, hum, whistle, beatbox, or imitate musical sounds and convert the performance into editable musical events that can be played with instruments from the Sound Library.

This programme builds on the Sound Library, playback engine, mic recording workflow, and non-destructive Sample Editor. It must be implemented after those foundations are stable rather than as one large Copilot task.

### Recognition modes

**Melody**
- Convert singing, humming, whistling, or a monophonic instrument imitation into note events.
- Capture pitch, start time, duration, velocity, and pitch bends where practical.
- Display results in the piano roll for correction.

**Beat**
- Detect beatbox and percussive vocal onsets.
- Classify broad events such as kick, snare, closed hi-hat, open hi-hat, clap, tom, cymbal, and unknown percussion.
- Display results in the Beat grid and allow one-tap sound correction.

**Bass**
- Optimise pitch detection for a lower vocal range.
- Create an editable bass line and assign a Bass instrument by default.

**Layer**
- Record separate parts over an existing loop.
- Support the recommended sequence: Beat, Bass, Melody, Harmony/Layer, then instrument selection.
- Keep separate-track recording as the default because it is easier to interpret than mixed melody and percussion.

### Recognition pipeline

```text
Microphone recording
→ Preserve original recording
→ Optional Sample Editor cleanup
→ Input mode: Melody / Beat / Bass / Experimental Mixed
→ Pitch tracking or percussion onset detection
→ Note/event segmentation and confidence scoring
→ Tempo and beat-grid estimation
→ Optional pitch and timing correction
→ Editable note or percussion events
→ Instrument assignment from Sound Library
→ Playback, layering, and export
```

### Performance versions

Keep three linked versions of every recognised performance:

1. **Original**: the unmodified recording.
2. **Cleaned**: noise and recording defects reduced without changing the intended performance.
3. **Quantised**: optional pitch and timing correction applied to generated events.

Users must be able to compare these versions and reduce or disable correction.

---

## 18. Melody and Pitch Recognition

### Event model

A recognised melodic event should support:

```ts
interface NoteEvent {
  id: string;
  note: number;
  start: number;
  duration: number;
  velocity: number;
  confidence?: number;
  pitchBend?: Array<{ time: number; value: number }>;
}
```

### Detection requirements

- Detect individual notes from monophonic singing, humming, whistling, and similar sources.
- Estimate note start, duration, pitch, and relative velocity.
- Preserve intentional slides, bends, and vibrato where the detector supports them.
- Avoid converting every small pitch fluctuation into a separate note.
- Display confidence for uncertain notes rather than silently presenting them as certain.
- Keep the source waveform visible behind detected notes where practical.

### Correction controls

- Raw detected pitch view.
- Snap to nearest note.
- Optional scale-aware correction.
- Light, Medium, and Strong pitch correction.
- Octave up/down.
- Transpose by semitones.
- Split, join, move, shorten, lengthen, or delete notes.
- Restore the original detected result.

### Initial implementation approach

Evaluate an audio-to-MIDI transcription engine such as Spotify Basic Pitch for the first implementation. Keep recognition behind an adapter/interface so the model can be replaced without changing the editor, project format, or Sound Library.

Do not couple the UI directly to one recognition model's output format.

---

## 19. Beatbox and Rhythm Recognition

### Event model

```ts
interface PercussionEvent {
  id: string;
  type: string;
  start: number;
  velocity: number;
  confidence?: number;
  assignedSoundId?: string;
}
```

### Processing stages

1. Detect percussive onsets.
2. Extract a short audio segment around each onset.
3. Classify the segment into a broad percussion class.
4. Estimate relative velocity.
5. Place the event on the Beat timeline.
6. Offer optional quantisation to the detected grid.
7. Map each class to a Sound Library sound or selected drum kit.

### Initial classes

- Kick
- Snare
- Closed hi-hat
- Open hi-hat
- Clap
- Tom
- Cymbal
- Bass/percussive low sound
- Unknown percussion

### Correction workflow

- Tapping an event opens compatible sounds from the hierarchical Sound Library.
- Reclassifying an event must not change its time or velocity.
- Users can correct one event or all matching events.
- Low-confidence events must be visually distinguishable.
- Unknown events remain playable and editable rather than being discarded.

### Personal calibration, later phase

Allow users to record examples of their own kick, snare, and hi-hat sounds and save a private beatbox calibration profile. This is a later enhancement and must not block the first broad classifier.

---

## 20. Tempo, Rhythm, and Quantisation

### Tempo detection

- Estimate tempo after recording.
- Allow users to correct the detected BPM.
- Present plausible half-time or double-time alternatives when detection is ambiguous.
- Preserve the unquantised timing as the source of truth.

### Recording assistance

- Optional count-in.
- Optional metronome.
- Loop length selection before recording.
- Visual recording position and bar/beat indicators.

### Quantisation

- Off, Light, Medium, and Strong timing correction.
- Musical grids such as 1/4, 1/8, 1/16, and triplet subdivisions where supported.
- Adjustable correction strength rather than mandatory hard snapping.
- Per-track and per-selection quantisation.
- Undo and Reset to detected timing.

---

## 21. Recognition Editing and Track Integration

### Melody editor integration

Recognised melodic events open in the existing piano roll. The user can select any compatible pitched instrument from the hierarchical Sound Library without rerunning recognition.

### Beat editor integration

Recognised percussion events open in the Beat grid. The user can select a kit, replace individual sounds, and correct classifications without changing the original recording.

### Track controls

Each recognised track supports:

- Rename
- Instrument/sound selection
- Mute and Solo
- Volume and pan
- Duplicate
- Re-record
- Replace recognition result
- Keep original audio audible or muted
- Delete

### Project persistence

Store:

- Original and processed recording references
- Recognition mode
- Recognition model/version
- Generated musical events
- User corrections
- Quantisation settings
- Assigned sound IDs
- Confidence values where retained

A recognition model update must not silently rewrite events in an existing project.

---

## 22. Arrangement and Musical Assistance

Implement only after transcription and correction are reliable.

### Progressive interpretation levels

1. **Play exactly what I performed**
2. **Clean it up**
3. **Correct pitch and timing**
4. **Turn it into an instrument phrase**
5. **Suggest chords**
6. **Add a bass line**
7. **Add accompaniment**
8. **Build a style-based arrangement**

### Product rules

- Clearly distinguish transcription, correction, and newly generated arrangement material.
- Never overwrite the original performance.
- Generated tracks must be separately identifiable, editable, replaceable, and removable.
- Provide a mode that uses only the user's original notes.
- Require user selection before adding generated material to the project.

### Later arrangement options

- Chord suggestions under a melody
- Bass following chords or melody
- Drum pattern suggestions
- Harmony generation
- Pop, electronic, acoustic, orchestral, and other style templates
- Higher-quality server-side rendering where appropriate

---

## 23. Recognition Architecture and Privacy

### Architecture

- Keep audio preprocessing, recognition, event conversion, correction, and UI editing as separate modules.
- Use adapters around external or replaceable recognition engines.
- Use stable internal NoteEvent and PercussionEvent formats.
- Perform lightweight work locally where practical.
- Treat server processing as an optional implementation choice, not a requirement embedded in project files.
- Add cancellable progress states and actionable error messages for recognition jobs.

### Internal audio handling

- Preserve the source recording.
- Use a consistent internal processing format such as mono WAV at a fixed sample rate.
- Cache processed audio and recognition results.
- Do not rerun expensive recognition unless the recording or relevant settings change.

### Privacy

- Explain when audio leaves the device.
- Encrypt uploaded recordings in transit and at rest.
- Delete temporary server files according to a defined retention policy.
- Provide a clear delete-recording action.
- Do not use recordings for model training without explicit opt-in consent.

---

## 24. Recognition Delivery Programme

GitHub Copilot should implement the roadmap sequentially, with one focused pull request per phase or tightly related group of tasks.

### Programme A: Foundations

1. Sound Library registry and hierarchical picker
2. Core instrument and Beat sound expansion
3. Stable playback and project migration
4. Non-destructive Mic Sample Editor
5. Piano roll and Beat grid readiness

### Programme B: Melody recognition

1. Recognition adapter and event models
2. Import/record audio into the recognition pipeline
3. Melody-to-note conversion
4. Piano-roll display and corrections
5. Pitch bends/confidence handling
6. Production and mobile tests

### Programme C: Beatbox recognition

1. Onset detection
2. Broad percussion classifier
3. Beat-grid event generation
4. Manual classification correction
5. Drum-kit and Sound Library mapping
6. Production and mobile tests

### Programme D: Timing and layering

1. Tempo detection
2. Count-in and metronome
3. Quantisation controls
4. Loop recording
5. Multi-track layering and synchronisation

### Programme E: Arrangement

1. Chord suggestions
2. Bass generation
3. Accompaniment and harmony
4. Style templates
5. Higher-quality rendering and export enhancements

### Copilot execution rule

For each phase, Copilot must:

- Read this master plan and the current repository instructions.
- Inspect the current implementation before proposing changes.
- Implement only the named phase.
- Avoid unrelated refactoring.
- Preserve existing projects and behaviours.
- Run relevant automated and production-build tests.
- Report confirmed changes, limitations, migrations, and remaining risks.
- Create a focused pull request for review.

---

## 25. Implementation phases

### Foundation Phase 1: Library architecture

- Audit current sound definitions, loading, menus, and project persistence.
- Create the central instrument registry.
- Define stable IDs and map all existing sounds.
- Build reusable group, subgroup, sound, search, and preview views.
- Replace flat dropdowns with the hierarchical picker.
- Preserve all existing behaviour and sounds.
- Add registry validation and migration tests.

### Foundation Phase 2: Core melodic instruments

Add the first useful set:

**Keys**
- Grand Piano
- Upright Piano
- Rhodes-style Electric Piano
- Organ

**Guitars**
- Nylon Guitar notes
- Steel Guitar notes
- Clean Electric notes
- Distorted Electric notes

**Bass**
- Finger Bass
- Slap Bass
- Synth Bass

**Strings**
- Violin
- Cello
- String Ensemble
- Pizzicato Strings

Validate pitch range, note duration, looping, velocity response, loading performance, and mobile playback for every instrument.

### Foundation Phase 3: Guitar chords

- Add chord event representation if it does not already exist.
- Add guitar-friendly voicing logic.
- Implement sustained, down-strum, up-strum, muted, and power-chord playback where supported.
- Add chord names and editing controls.
- Test unsupported chords and fallback behaviour.
- Keep note mode and chord mode clearly separated.

### Foundation Phase 4: Beat expansion

- Add the expanded kick, snare, hi-hat, cymbal, tom, and clap groups.
- Add percussion groups.
- Add complete drum kits.
- Preserve patterns when sounds or kits change.
- Add one-shot and kit previews.
- Test rapid triggering and overlapping sounds.

### Foundation Phase 5: Additional instruments

- Add remaining Keys.
- Add Brass & Winds.
- Add Synth leads, pads, plucks, and keys.
- Add remaining Bass and String sounds.
- Add FX & Other only after defining a clear product use for that group.

### Foundation Phase 6: Mic Sample Editing & Enhancement

- Implement the Sample Editor phases defined above, beginning with non-destructive cleanup and then musical transformation.
- Integrate processed mic samples with the central Sound Library registry and project persistence.
- Test sample processing in both Beat and pitched/melodic workflows.

### Foundation Phase 7: UX polish

- Add Favourites.
- Add Recent sounds.
- Add search and tags.
- Add family icons and colour accents.
- Improve loading, empty, missing-asset, and error states.
- Review accessibility and keyboard navigation.
- Test all picker flows on phone-sized screens.

---

## 26. Testing plan

### Registry tests

- Every ID is unique.
- Every active sound has a valid asset.
- Each entry references a valid group and playback mode.
- Existing sound IDs map correctly.
- Unavailable sounds are handled predictably.

### Picker tests

- Navigate group to subgroup to sound and back.
- Search returns the correct sound and category path.
- Preview does not modify the project.
- Selection updates the correct channel only.
- Favourites and Recent remain deduplicated.
- Long names remain readable on mobile.

### Playback tests

- Notes trigger at the correct pitch and time.
- Sustained notes stop correctly.
- Chords use the selected voicing and articulation.
- Percussion sounds trigger without clipping or unwanted delay.
- Rapid repeated hits remain stable.
- Switching sounds preserves musical events.
- Applying a kit preserves the Beat pattern.

### Project compatibility tests

- Load projects created before the expansion.
- Save and reload migrated projects.
- Handle missing assets without data loss.
- Confirm old projects sound equivalent after migration.

### Recognition tests

- Melody recordings produce editable note events with plausible start times and durations.
- Beatbox recordings produce editable percussion events without discarding unknown sounds.
- Low-confidence events are identifiable and correctable.
- Pitch and timing correction can be reduced, disabled, and reset.
- Changing the assigned instrument does not rerun recognition or alter musical events.
- Original, cleaned, and quantised versions remain available.
- Model changes do not silently rewrite existing projects.
- Interrupted or failed recognition does not corrupt the source recording or project.

### Tempo and layering tests

- Tempo correction updates the grid without destroying original timing.
- Count-in and metronome remain synchronised with recording.
- Layered tracks remain aligned through playback, save, reload, and export.
- Quantisation strength behaves consistently across melody and Beat tracks.

### Arrangement tests

- Suggested or generated material is clearly separated from transcription.
- Generated tracks can be edited, replaced, muted, and deleted.
- The original performance remains unchanged after arrangement actions.
- The user can restrict arrangement to existing notes where supported.

### Deployment tests

- Run production build checks.
- Test the deployed GitHub Pages path under `/HeadJams/`.
- Confirm direct page loading and asset paths work.
- Test Safari on iPhone and at least one desktop browser.

---

## 27. Definition of done

The expansion is complete when:

- All sound selectors use the hierarchical library.
- Existing projects remain usable.
- Existing sounds continue to work.
- Core new instruments and expanded Beat sounds are available.
- Guitar note mode and chord mode are both functional.
- Sound and kit previews do not modify projects.
- Selecting a new sound preserves existing notes or Beat patterns.
- The registry validates IDs and assets.
- Sounds are loaded on demand rather than all at start-up.
- Mobile navigation is usable without oversized flat dropdowns.
- Production builds and the GitHub Pages deployment pass testing.
- Melody recognition creates editable piano-roll events from a recorded monophonic performance.
- Beatbox recognition creates editable Beat-grid events with manual correction.
- Tempo and quantisation controls preserve the original performance.
- Recognition results use stable internal event formats and Sound Library IDs.
- Original, cleaned, and quantised performance versions are retained.
- Generated arrangement material is clearly separated from transcription.
- Each recognition programme has been delivered and reviewed through focused pull requests.

---

## 28. Recommended delivery order

1. Central registry and migration mapping
2. Hierarchical Sound Library picker
3. Preview system
4. Core Keys, Guitar notes, Bass, and Strings
5. Expanded Drums, Percussion, and drum kits
6. Guitar chord mode
7. Mic Sample Editor: cleanup and non-destructive processing
8. Mic Sample Editor: pitch, speed, time stretch, and musical timing
9. Piano-roll and Beat-grid hardening
10. Recognition adapter and stable event models
11. Melody and bass recognition
12. Beatbox onset detection and classification
13. Tempo detection and quantisation
14. Loop recording and multi-track layering
15. Search, Favourites, Recent, and additional instruments
16. Chord, bass, harmony, and accompaniment suggestions
17. Style-based arrangement and higher-quality rendering
18. Accessibility, privacy, performance, export, and deployment hardening

Implement this order sequentially. Each numbered item should be one focused pull request or a small set of tightly scoped pull requests, not one combined implementation task.
