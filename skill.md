# UI Layout Rules

- Keep File, Settings, Help, and other header controls on the left; keep Play/Stop at the right end of the header row.
- Render the MusicMaker wordmark in white.
- Keep the Sound library's Search sounds and Tag controls the same height when displayed in the same row.
- Keep every control in the Beat tab's options row (Template, BPM, Note length, Loop, Pattern, Drum kit, Apply kit) the same height and font size; they share `--option-control-height` in `.beat-options`.
- Select dropdowns use `appearance: none` with a CSS chevron; iOS Safari ignores `height`/`min-height` on native-styled selects, so never remove it.
- In each channel strip, align controls to the bottom edge and keep every control 40px tall so Track name and the sound picker line up.
- Channel strip order is: Track name, then [sound picker, S (solo), M (mute), preview], then Volume/Pan, then [duplicate, Piano roll/Grid, remove]. On phones each group is its own row (picker takes the remaining width), so nothing can wrap alone.
- Library: Sounds, Sample editor and Recognition are exclusive accordion sections (`<details name="library-section">`); search/tag/channel filters live inside Sounds. Sound tiles stay two columns, with Play above Use on the right, no inner scroll, grouped by category as an exclusive accordion: every group starts collapsed, opening one collapses the previous, and a search or tag filter opens the first matching group. Tutorials open any collapsed section that contains their target.
- Library, Song and Sound controls are 40px and arranged in two-column grids (`.record-controls`, `.recognition-controls`, `.effect-controls`); a select and its action button share a row and stack full width when they do not fit.
- Do not add explanatory paragraphs to the Library, Song or Sound tabs; labels and values only.
- Sound tab: the top tile is "Shape a sound" (swing and effects) and the bottom tile "Make a sound" (the designer) is always shown, with no toggle button or Close.
- Status toasts sit above the sticky header (z-index 30) at the top right; the first-visit "New here?" bubble sits above the bottom tab bar so the two never overlap.
- Undo/Redo live at the top of the File tile (the header has no room at 320–390px); big one-shot actions add an Undo button to their toast.
- Header row: File, Settings, Help, then a red Capture (record) button, with Play at the right end. At ≤380px Play narrows to fit; the row must fit at 320px.
- Library's third section is **Ideas**: one 40px row per captured take (name, Hear as select, play, delete), above the advanced recognition controls; at ≤380px the select narrows so the name stays readable at 320px.
- Song › Chords by ear: Key, Rhythm and Play on selects and Find chords follow the 40px two-column control grid; each progression is one row (name and chords on the left, wrapping under the name when narrow; 44px Play and 64px Use on the right).
