# UI Layout Rules

- Keep File, Settings, Help, and other header controls on the left; keep Play/Stop at the right end of the header row.
- Render the MusicMaker wordmark in white.
- Keep the Sound library's Search sounds and Tag controls the same height when displayed in the same row.
- Keep every control in the Beat tab's options row (Template, BPM, Note length, Loop, Pattern, Drum kit, Apply kit) the same height and font size; they share `--option-control-height` in `.beat-options`.
- Select dropdowns use `appearance: none` with a CSS chevron; iOS Safari ignores `height`/`min-height` on native-styled selects, so never remove it.
- In each channel strip, align controls to the bottom edge and keep every control 40px tall so Track name and the sound picker line up.
