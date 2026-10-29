# UI Design Proposal: Splitting the Single Long Screen

> **Historical document.** Kept for reference; parts are out of date. Current plan: `plan.md`. Current UI rules: `skill.md`.

Status: **implemented** (4 tabs). Decisions from review are folded into the sections below; deviations are listed in section 9.

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

**Header tiles**: File, Share, View, Settings and Help buttons toggle same-style tiles opening below the header (one at a time, no Close button).

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
[🥁 Beat][🎚 Sound][📚 Library][🎬 Song]
```
Swing moves to Sound; Template to ⋯ menu and to the first-run welcome.

### Piano roll mode (inside Beat)
Channel picker on top, piano roll fills the screen, scale controls in a compact row, pitch/time tools in a bottom sheet. Empty state: "Pick a channel to add notes."

### Sound
Big labelled sliders with plain-language names ("Echo", "Space", "Brightness"), real-time effect on playback. "Make a sound" opens as a full-screen sub-page instead of appended at page bottom.

### Library
Search bar + category chips; list/pad toggle; floating "＋ Add sample" → record / import flow as a stepper (Record → Trim → Name → Save). "Use" prompts for a channel, then offers "Go to Beat".

### Song
Pattern chips, "Launch" grid, arrangement timeline. The Song tab is hidden until unlocked (section 6).

## 5. Cross-cutting behaviour
- Playback keeps running while switching tabs; the playhead shows in the Beat grid.
- Each channel has its own Grid / Piano roll toggle on the Beat tab (no separate Notes tab).
- A small Pattern dropdown appears on Beat once there are 2+ patterns; full management is in Song.
- Tutorials: each step may declare the tab (`view`), project menu (`menu`) or piano-roll mode (`pianoRoll`) it needs; the app switches automatically. Existing selectors (`#play-btn`, `#add-channel`, `#note-length`, `#loop-bars`, `#save-btn`, `#export-btn`, `#new-pattern`) are preserved.
- Auto-save unchanged; show subtle "Saved" indicator instead of a Save button as the primary path.
- Persist last-open tab in localStorage.
- Accessibility: tabs use `role="tablist"`, keyboard arrows, focus kept on switch.

## 6. Progressive disclosure
First run shows only Beat + Library; Sound and Song tabs appear after the first Play, when a tutorial needs them, or via "Show all tabs" in the ⋯ menu. Returning users (tutorial already seen) see everything. Keeps the beginner experience simple, power users unblocked.

## 7. Implementation (done)
1. `App.tsx`: `view` state, tab bar (`role="tablist"`, arrow keys), last tab persisted in localStorage, unlock logic.
2. `CompositionEditor.tsx` split into `PianoRoll` (per channel, used inside Beat) and `SongEditor` (patterns + arrangement); Sound tab holds swing, effects and the sound designer; Library tab holds `SampleLibrary`.
3. Template / Save / Export WAV / Show all tabs moved into the ⋯ project menu; BPM and Play stay in the sticky top bar; Note length and Loop sit on Beat.
4. CSS: sticky top bar, bottom tab bar under 640px, side-by-side layout at 1100px+ (Beat always visible, other tab in a second column).
5. Tutorials switch screens as needed.

Still to do: manual usability pass on desktop and phone, then resume Phase 5 (PWA, Capacitor, sync, MIDI: Settings/Account in ⋯ menu, Marketplace as a Library sub-tab).

## 8. Decisions (from review)
1. **Four tabs** – Sound stays separate from Library.
2. **Beat and Notes merge** into one screen. Each channel gets a Grid / Piano roll toggle (every channel defaults to Grid). Scale, snap, chord assist and pitch/time tools show only in Piano roll mode. Result: **Beat, Sound, Library, Song** tabs, plus the top bar.
3. **Progressive disclosure: yes** – first run shows Beat and Library; Sound and Song unlock after the first loop is played (or via "Show all" in settings).
4. **Desktop: side-by-side layout** – Beat on top, with a lower dock showing Sound / Library / Song panels beside or under it; phones keep the bottom tab bar. Same components, different layout via CSS breakpoint.

## 9. Deviations from the proposal
- No mini playhead in the top bar and no "Saved" indicator yet; Save remains in the ⋯ menu.
- Sound designer opens inline in the Sound tab rather than as a full-screen sub-page.
- Library add-sample flow is unchanged (not yet a stepper); Library "Use" does not yet offer "Go to Beat".
- Pitch/time tools are a collapsible section rather than a bottom sheet.

## Tutorials
A "? Help for this screen" button under the tabs opens the tutorial hub for the current screen ("Show all tabs" lists everything; the header "? Tutorials" opens it unfiltered). The hub has two modes: Actions (collapsible feature groups) and Workflows (goal-based paths with progress and Continue). The overlay offers Back, Next, Show me, Skip step and Exit.
