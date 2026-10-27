# Tutorial Plan

Goal: every feature has a short, interactive, user-friendly tutorial, organised both by feature (per tab) and by workflow (use case).

## Audit (original state)
One global "? Tutorials" button opened a flat list of 7 tutorials (`src/tutorial/tutorials.ts`), driven by `TutorialOverlay`. Covered: first beat, note length, loop bars, add channel/sound, save/export, record a sample, basic composition. Most other features had no tutorial.

## Plan and status

### 1. Data model — DONE
- [x] `Tutorial` has `tab`, `group`, `summary`, `level`, `estMinutes`, `features`, `doneMessage`.
- [x] `Workflow` type (title, outcome, ordered tutorial ids); tutorials are the single source of truth.
- [x] `TutorialStep` options `info` (always-skippable informational step) and `fallback` (message when target missing).
- [x] New events: `kit-applied`, `template`, `designer-open`.
- [ ] Not done: a generic step-level `optional`/`selector fallback` option; events `effect-added`, `sample-edited`, `recognized`, `chord-added`, `midi-start` (steps use project-state checks or info steps instead).

### 2. Per-tab Help button and hub — DONE
- [x] "? Help for this screen" button under the tabs opens `TutorialMenu` for the current tab; header "? Tutorials" opens it for all tabs.
- [x] Actions mode: collapsible feature groups with tick marks and counts.
- [x] Workflows mode: goal-based paths with progress bar, "Step X of Y" and Start/Continue.
- [x] "Show all tabs" toggle.
- [ ] Not done: button placed inside each tab's own header (currently one shared button below the tab bar).

### 3. Workflows — MOSTLY DONE
- [x] Make a song from scratch; Record and use your own sound; Sing or hum a melody; Beatbox a drum loop; Design your own instrument; Share your work.
- [ ] Missing: "Play a part with a MIDI keyboard" (MIDI is not implemented yet; Phase 13).

### 4. User-friendliness — MOSTLY DONE
- [x] Back, Next, Skip step, Show me, Exit; step counter; completion message.
- [x] Completion persisted in `musicmaker.tutorialDone`; checkmarks; "Reset tutorials".
- [x] First-visit "New here? Try a tutorial" nudge on non-Beat tabs; auto-start only on first run.
- [x] Fallback text when a target is missing; focus-trapped, Escape-closable hub; `aria-live` step text; reduced-motion; mobile safe-area docking.
- [ ] Missing: feature-detection gating of mic/MIDI tutorials; overlay focus management; dedicated "permission denied" step content; workflow completion stored separately (derived from tutorial completion today).

### 5. Content — MOSTLY DONE
- [x] Original 7 kept with unchanged ids, regrouped.
- [x] New: tempo & swing, mixing, templates, sound picker, drum kits, guitar chords, pitch/time tools, Sound Designer, effects, import audio, Sample Editor, recognition, recognition correction, patterns/launcher, timeline, arrangement assistance, export options, privacy/offline (24 total).
- [ ] Missing: MIDI recording tutorial; low-confidence/take cues and keyboard-navigation tutorial; dedicated pad view and tagged-library search steps.
- [ ] Needs follow-up: Sample Editor, recognition correction, import and some arrangement-assist steps are informational only (Next always enabled) because the components do not emit completion events yet; their highlight selectors have not been verified in a browser.

### 6. Coverage check — PARTLY DONE
- [x] `src/tutorial/tutorials.test.ts`: unique ids, known groups, original ids kept, every listed feature covered, workflow ids resolve, first-step predicate, progress persistence.
- [ ] Missing: test that every `target` selector exists in the rendered UI (needs a DOM test environment); unit tests for the remaining `done()` predicates.

### 7. Docs — DONE
- [x] `plan.md` (Phase 14), `README.md`, `ui-design.md` updated.

### 8. Delivery — done in a single change instead of six PRs (a–f).

## Remaining work (summary)
1. Emit real events from Sample Editor, recognition, import and arrangement UIs, and convert info steps into checked steps.
2. MIDI tutorial and workflow once MIDI input exists.
3. Selector/DOM coverage test and more `done()` unit tests.
4. Mic/MIDI feature-detection gating and permission-denied guidance.
5. Tutorials for confidence/take cues, keyboard navigation, pad view and library search.
6. Verify the full flow in a browser (mobile and desktop).
