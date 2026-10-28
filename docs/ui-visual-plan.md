# UI Visual & UX Improvement Plan

Scope: layout, overlap/clipping, original icons, new palette, general UX. Based on `plan.md`, `README.md`, `ui-design.md`, `src/ui/App.tsx`, `src/ui/styles.css`. Static mockups: `docs/mockups/` (open in a browser; tabs are clickable).

## 1. Findings
**Layout / overlap / clipping**
- Header (`.bar`) holds title, Play, BPM, volume, project menu, tutorials and wraps unpredictably; it is sticky at `top:0` while `.tabs` is sticky at a hard-coded `top:56px`, so a wrapped header makes the tabs overlap content or the header.
- Project menu popup (`.menu-popup`: `absolute; right:0; top:46px`) has no viewport collision handling; it can extend below/left of the screen on short or narrow viewports. Same risk for the sound picker (fixed backdrop is OK, but `max-height:80vh` ignores mobile browser chrome - use `dvh` and safe-area insets), native `<select>` lists, and the toast (`fixed top/right`) which covers the sticky header and Play button.
- Mobile bottom tab bar is `position:fixed` with a guessed `padding-bottom:200px` on `.app`; tutorial overlay, toasts and FABs can sit under it.
- Channel strip (sound button, preview, mute, solo, duplicate, piano toggle, remove, volume, generated badge) wraps into 2-3 uneven rows; the 16-step grid with 40px min height forces horizontal squeeze on narrow screens.
- Beat options row (note length, loop, drum kit, apply kit, swing, template) is a flat wrap of controls with no grouping.
- Library/Song/Composition panels stack many full-width panels; the piano roll, pitch/time tools and arrangement compete for space.

**Visuals**
- Icons are emoji (🎵🥁🎚📚🎬🔊), which render differently per OS and clash with the dark UI; `.family-icon` uses emoji too.
- Palette: generic navy `#14141f` with pastel family colours at near-equal weight, `#06d6a0`/`#ffd166` accents. Low hierarchy; "on" state and "primary" state look alike; muted/secondary buttons are barely distinguishable (`transparent` with `#444` border).
- Inline hard-coded hex values throughout `styles.css`; no design tokens, so theming is hard.

**UX**
- Several tiny targets (34px sound-action buttons), no visible grouping of mute/solo vs destructive Remove next to each other.
- "? Help for this screen" row consumes a full row on every tab.
- No empty/loading states beyond text hints; no distinct playing-state indicator other than a white outline.
- Contrast of `.hint` (opacity .7) and `#444` borders on `#262638` is marginal.

## 2. Plan (phased, one PR each)
1. **Foundations - tokens and layout shell.** Introduce CSS custom properties (surface, elevation, text, accent, danger, family colours, radius, spacing, tap size 44px) and replace hard-coded hex values. Use one app shell: header + tabs as a single sticky block (removes the `56px` magic number), `100dvh`, safe-area insets, and a CSS variable for bottom-bar height instead of `200px` padding.
2. **Popover/overlay system.** One small `Popover` component (project menu, kit/template menus, toasts) that measures the trigger and flips/shifts to stay inside the viewport (or becomes a bottom sheet under 640px). Move toast to bottom above the tab bar (`aria-live`). Sound picker and sample editor become full-height sheets on mobile. Add Escape/outside-click/focus-return.
3. **Original icon set.** Replace emoji with a small in-repo SVG sprite (`currentColor`, 24px grid, 1.8 stroke): tabs (Beat, Sound, Library, Song), actions (play/stop, add, mute, solo, volume, duplicate, piano, remove, menu, help, mic, import) and instrument families (kick, snare, hat, bass, keys, strings, guitar, brass, synth, FX, sample, custom). Prototypes are in the mockups. Keep `aria-label`s; icons are decorative.
4. **Palette.** Pick one of the three directions below, define light/dark tokens, ensure WCAG AA (4.5:1 text, 3:1 controls), keep family colours but tune saturation per theme, and give distinct states: primary (filled accent), selected (tinted + outline), muted (dim), playing (glow/bright step), destructive (danger colour, separated).
5. **Beat tab.** Compact channel card: row 1 = family icon, name, sound button (truncating), overflow menu; row 2 = M / S / volume; grid below. Secondary actions (duplicate, piano/grid toggle, remove, preview) move into a per-channel overflow menu. Group note length/loop/kit into a collapsible "Pattern options" bar. Show a beat-group tint every 4 steps and a clear playhead column. Horizontal scroll with snap for 4-bar loops on small screens rather than shrinking cells.
6. **Sound / Library / Song tabs.** Sound: large labelled sliders (as in mockups) with value readouts and "Make a sound" as a full-screen sub-page. Library: search + category chips, card/pad view with family icon, sticky "+ Add sample" button above the tab bar. Song: pattern chips, coloured arrangement timeline with scroll/zoom, suggestions card; piano roll and pitch/time tools open as a bottom sheet.
7. **Polish and QA.** Replace the help row with a header `?` icon; skeleton/empty states; `prefers-reduced-motion` and `prefers-color-scheme` (if light theme chosen); visual checks at 360, 390, 768, 1280 widths, with the menu/sheet clipping cases as explicit test scenarios (Playwright screenshots); keep existing tutorials' selectors (`#play-btn`, `#apply-kit`, `#make-sound`, tab IDs) working or update the tutorial steps.

## 3. Mockups (4 tabs each: Beat, Sound, Library, Song)
| File | Direction | Palette | Layout |
|---|---|---|---|
| `mockups/A-midnight-studio.html` | Refined evolution of current look | Deep navy surfaces, mint `#2ee6a6` primary, coral/amber/yellow/cyan/violet channel colours | Rounded cards, bottom tab bar with icon + label, sticky header |
| `mockups/B-paper-and-ink.html` | Friendly, playful, light theme | Warm cream `#f6f1e7`, ink `#2a2438`, indigo `#5b5bd6`, coral `#ff7a59` | Bold outlines + offset shadows, left tab rail on desktop, bottom bar on mobile |
| `mockups/C-neon-pulse.html` | Hardware / performance feel | Near-black `#07060d`, neon magenta/orange/mint, mono BPM display | Segmented top tabs (icons only on mobile), glowing steps and square pads |

All three share the same original SVG icon set and the same information architecture; only tokens and layout chrome differ, so the choice is mostly a theme decision and the implementation plan above applies to any of them.

## 4. Decisions needed
- Which direction (A/B/C), or dark default with optional light theme (A + B tokens)?
- Keep emoji for any place (e.g. toasts) or fully custom icons?
- Is moving per-channel secondary actions into an overflow menu acceptable for discoverability (tutorials need updating)?
