# Tutorial Plan

> **Historical document.** Kept for reference; parts are out of date. Current plan: `plan.md`. Current UI rules: `skill.md`.

Goal: every feature has a short, interactive, user-friendly tutorial, organised both by feature (per tab) and by workflow (use case).

## Audit (original state)
One global "? Tutorials" button opened a flat list of 7 tutorials (`src/tutorial/tutorials.ts`), driven by `TutorialOverlay`. Covered: first beat, note length, loop bars, add channel/sound, save/export, record a sample, basic composition. Most other features had no tutorial.

## Plan and status

### 1. Data model — DONE
- [x] `Tutorial` has `tab`, `group`, `summary`, `level`, `estMinutes`, `features`, `doneMessage`.
- [x] `Workflow` type (title, outcome, ordered tutorial ids); tutorials are the single source of truth.
- [x] `TutorialStep` options `info` (always-skippable informational step) and `fallback` (message when target missing).
- [x] New events: `kit-applied`, `template`, `designer-open`.
- [x] Tutorial capability requirements now gate microphone tutorials when browser recording APIs are unavailable; action events track sample edits, imports, recognition corrections, and library actions.
- [x] MIDI capability gating and `midi-connected` / recorded-note events now support the MIDI keyboard tutorial.
- [ ] Not done: a generic step-level `optional`/`selector fallback` option.

### 2. Per-tab Help button and hub — DONE
- [x] "? Help for this screen" button under the tabs opens `TutorialMenu` for the current tab; header "? Tutorials" opens it for all tabs.
- [x] Actions mode: collapsible feature groups with tick marks and counts.
- [x] Workflows mode: goal-based paths with progress bar, "Step X of Y" and Start/Continue.
- [x] "Show all tabs" toggle.
- [ ] Future polish: place the shared Help button inside each tab's own header.

### 3. Workflows — DONE
- [x] Make a song from scratch; Record and use your own sound; Sing or hum a melody; Beatbox a drum loop; Design your own instrument; Share your work; Play a part with a MIDI keyboard.

### 4. User-friendliness — MOSTLY DONE
- [x] Back, Next, Skip step, Show me, Exit; step counter; completion message.
- [x] Completion persisted in `musicmaker.tutorialDone`; checkmarks; "Reset tutorials".
- [x] First-visit "New here? Try a tutorial" nudge on non-Beat tabs; auto-start only on first run.
- [x] Fallback text when a target is missing; focus-trapped, Escape-closable hub; `aria-live` step text; reduced-motion; mobile safe-area docking.
- [x] Feature-detection gating for microphone tutorials and overlay focus trapping, Escape exit, and focus restoration.
- [ ] Future polish: dedicated permission-denied tutorial step; workflow completion remains derived from tutorial completion.

### 5. Content — MOSTLY DONE
- [x] Original 7 kept with unchanged ids, regrouped.
- [x] New: tempo & swing, mixing, templates, sound picker, drum kits, guitar chords, pitch/time tools, Sound Designer, effects, import audio, Sample Editor, recognition, recognition correction, patterns/launcher, timeline, arrangement assistance, export options, privacy/offline, confidence cues, keyboard navigation, library tools, MIDI keyboard (28 total).
- [x] Added low-confidence/take-cue and keyboard-navigation tutorials, plus pad-view and tagged-library search steps.
- [x] MIDI keyboard tutorial and workflow are implemented with capability gating.
- [x] Some arrangement-assist and explanatory steps remain informational. Rendered selector coverage passes; desktop and mobile browser checks verified tutorial highlights and overlay behavior. MIDI permission denial was simulated; physical MIDI hardware was unavailable.

### 6. Coverage check — PARTLY DONE
- [x] `src/tutorial/tutorials.test.ts`: unique ids, known groups, original ids kept, every listed feature covered, workflow ids resolve, first-step predicate, progress persistence.
- [x] Added capability-gating and completion-predicate tests for interactive tutorial events.
- [x] Rendered-DOM test validates every tutorial target selector across conditional UI states (`src/tutorial/tutorialTargets.test.tsx`).
- [ ] Broader unit coverage for remaining `done()` predicates.

### 7. Docs — DONE
- [x] `plan.md` (Phase 14), `README.md`, `ui-design.md` updated.

### 8. Delivery — done in a single change instead of six PRs (a–f).

## Remaining work (summary)
1. Expand `done()` predicate tests.
2. Desktop and mobile browser verification is complete, including target highlights and simulated MIDI permission-denied guidance. Physical MIDI input and real browser permission prompts still require a device/browser environment.
