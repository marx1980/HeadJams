# MusicMaker

A simple, beginner-friendly music-making app (web/PWA first). Pick a channel, choose or record a sound, set note length, and build loops.

Phases 0–4 (beat maker, tutorials, sampling, composition, sound shaping), Phase 7 guitar chords, and Phase 8 Sample Editor are complete. Import or record samples, edit them non-destructively with cleanup, tuning, timing, EQ and creative effects, then use the processed sound in your loop; guitar chord tracks support playable voicings and strummed, muted, and power-chord articulations. See `plan.md` for the roadmap, `docs/sound-library-spec.md` for the Sound Library, sample editor and recognition specs, `docs/research.md` for the market research and `docs/architecture.md` for the architecture.

## Essential Commands
- Install: `npm install`
- Run: `npm run dev`
- Test: `npm test`
- Build: `npm run build` (writes index.html + assets/ to repo root for GitHub Pages at /MusicMaker/; commit the output. Source entry: app/index.html)
