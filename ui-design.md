# UI Design Proposal: Splitting the Single Long Screen

Status: proposal for review (Phase 5 paused). No code changes yet.

## 1. Problem (user's view)
Everything lives on one scrolling page: a header with 9 controls, the channel/step grid, "Add channel / Make a sound", the Composition panel (patterns, scale, piano roll, pitch/time tools), Sound shaping (7 sliders), the Sound library (record/import), and overlays. A beginner must scroll to find things, loses sight of Play while editing, and sees advanced tools (piano roll, EQ) before they need them.

## 2. Principles
- One job per screen; the screen answers "what am I doing right now?"
- Beginner path first: Beat → Play → Save needs zero scrolling.
- Play/Stop, tempo and a mini playhead are always visible.
- Advanced controls are one tap away, never in the way.
- Same layout works on a phone (bottom tab bar) and desktop (top tabs / left rail), which fits the Capacitor plan.

## 3. Proposed navigation
Persistent **top bar** (always visible): logo · ▶ Play/■ Stop · BPM · project menu (⋯) · ? Help.
**Tab bar** (bottom on mobile, top on desktop), **4 tabs** (final; Notes merged into Beat, see section 8):

| Tab | Purpose | Contents (from today's UI) |
|---|---|---|
| 🥁 **Beat** (home) | Make loops and melodies | Per-channel Grid / Piano roll toggle (piano roll, scale/snap, pitch/time tools); channel strips + step grid, add channel, per-channel sound picker/preview/M/S/volume/remove, Note length, Loop length (1/2/4 bars) |
| 🎚 **Sound** | Shape the sound | Sound shaping (reverb, delay, filter, EQ), Swing, "Make a sound" designer; optional per-channel vs master toggle later |
| 📚 **Library** | Find, record, import sounds | Search/tags, pad view, record mic, import file, trim/normalize, "Use on channel…" |
| 🎬 **Song** | Arrange the whole track | Pattern list (new/rename/remove), loop launcher, arrangement timeline |

**Project menu (⋯)**: Templates, Save, Export WAV, New project, (later: cloud sync, MIDI settings). Removes 4 controls from the header.

## 4. Screen sketches

### Beat (home)
```
[🎵 MusicMaker]  [▶ Play]  BPM 120   [⋯] [?]
Note length [1/16▾]  Loop [2 bars▾]
┌ Kick  ▾ 🔊 M S ───── ✕ ┐
│ ■ □ □ □ ■ □ □ □ ...      │
└ Snare ▾ ...              ┘
[＋ Add channel]
[🥁 Beat][🎹 Notes][🎚 Sound][📚 Library][🎬 Song]
```
Swing moves to Sound; Template to ⋯ menu and to the first-run welcome.

### Piano roll mode (inside Beat)
Channel picker on top, piano roll fills the screen, scale controls in a compact row, pitch/time tools in a bottom sheet. Empty state: "Pick a channel to add notes."

### Sound
Big labelled sliders with plain-language names ("Echo", "Space", "Brightness"), real-time effect on playback. "Make a sound" opens as a full-screen sub-page instead of appended at page bottom.

### Library
Search bar + category chips; list/pad toggle; floating "＋ Add sample" → record / import flow as a stepper (Record → Trim → Name → Save). "Use" prompts for a channel, then offers "Go to Beat".

### Song
Pattern chips, "Launch" grid, arrangement timeline. Hidden "Song" tab until a second pattern exists? (Open question below.)

## 5. Cross-cutting behaviour
- Playback keeps running while switching tabs; the playhead shows in Beat and Notes.
- Selected channel is shared across tabs (tap a channel name on Beat → "Edit notes" jumps to Notes).
- Pattern switcher appears as a small dropdown in the top bar on Beat/Notes, full management in Song.
- Tutorials: each step may declare the tab it needs; the overlay auto-switches. Existing selectors (`#play-btn`, `#add-channel`, `#note-length`, `#loop-bars`, `#save-btn`, `#export-btn`, `#new-pattern`) must be preserved or tutorial definitions updated.
- Auto-save unchanged; show subtle "Saved" indicator instead of a Save button as the primary path.
- Persist last-open tab in localStorage.
- Accessibility: tabs use `role="tablist"`, keyboard arrows, focus kept on switch.

## 6. Progressive disclosure
First run shows only Beat + Library; Notes, Sound and Song tabs appear (or are un-greyed with a "New!" dot) after the first loop is played, or immediately when "Show all" is on in settings. Keeps the beginner experience simple, power users unblocked.

## 7. Implementation plan (small steps)
1. Add `Tabs`/`TopBar` components and a `view` state in `App.tsx`; no model changes.
2. Extract `BeatView`, `SoundView` (effects + swing + designer) from `App.tsx`; wrap existing `CompositionEditor` split into `NotesView` and `SongView`; `SampleLibrary` becomes `LibraryView`.
3. Move header items: Template/Save/Export into `ProjectMenu`.
4. Update CSS: sticky top bar, bottom tab bar on narrow screens, responsive layout.
5. Update tutorials to switch tabs; run existing tests and rebuild (`npm test`, `npm run build`).
6. Manual usability pass (the pending 2-minute test) on desktop and phone width.
7. Update README/plan.md; resume Phase 5 (PWA, Capacitor, sync, MIDI), which gain natural homes: Settings/Account in ⋯ menu, Marketplace as a Library sub-tab.

## 8. Decisions (from review)
1. **Five tabs is not too many** – keep Sound separate from Library.
2. **Beat and Notes merge** into one screen. Each channel gets a Grid / Piano roll toggle (drum-like sounds default to Grid, tonal sounds to Piano roll). Scale, snap and pitch/time tools show only in Piano roll mode. Result: **Beat, Sound, Library, Song** tabs, plus the top bar. (Superseded: the separate Notes tab in sections 3-4.)
3. **Progressive disclosure: yes** – first run shows Beat and Library; Sound and Song unlock after the first loop is played (or via "Show all" in settings).
4. **Desktop: side-by-side layout** – Beat on top, with a lower dock showing Sound / Library / Song panels beside or under it; phones keep the bottom tab bar. Same components, different layout via CSS breakpoint.

## 9. Next step
Implementation per section 7, adjusted for the decisions above (no `NotesView`; add per-channel editor toggle; add desktop dock layout). Awaiting go-ahead before touching code.
