# UI Layout Rules

- Keep File, Settings, Help, and other header controls on the left; keep Play/Stop at the right end of the header row.
- Render the MusicMaker wordmark in white.
- Keep the Sound library's Search sounds and Tag controls the same height when displayed in the same row.
- Keep every control in the Beat tab's options row (Template, BPM, Note length, Loop, Pattern, Drum kit, Apply kit) the same height and font size; they share `--option-control-height` in `.beat-options`.
- Select dropdowns use `appearance: none` with a CSS chevron; iOS Safari ignores `height`/`min-height` on native-styled selects, so never remove it.
- In each channel strip, align controls to the bottom edge and keep every control 40px tall so Track name and the sound picker line up.
- Channel strip order is: Track name, then [sound picker, S (solo), M (mute), preview], then Volume/Pan, then [duplicate, Piano roll/Grid, remove]. On phones each group is its own row (picker takes the remaining width), so nothing can wrap alone.
- Library: Sounds, Sample editor and Recognition are exclusive accordion sections (`<details name="library-section">`); search/tag/channel filters live inside Sounds. Sound tiles stay two columns, with Play above Use on the right, no inner scroll, grouped by category. Tutorials open any collapsed section that contains their target.
- Library, Song and Sound controls are 40px and arranged in two-column grids (`.record-controls`, `.recognition-controls`, `.effect-controls`); a select and its action button share a row and stack full width when they do not fit.
- Do not add explanatory paragraphs to the Library, Song or Sound tabs; labels and values only.

