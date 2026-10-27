# MusicMaker

A simple, beginner-friendly music-making app (web/PWA first). Pick a channel, choose or record a sound, set note length, and build loops.

Phases 0–4 (beat maker, tutorials, sampling, composition, sound shaping), Phase 7 guitar chords, Phase 8 Sample Editor, Phase 9 editor hardening, and Phase 10 on-device audio recognition are complete. Phase 11 arrangement assistance is underway with scale-aware chord suggestions from melody tracks; suggestions can be reviewed and edited before adding as separate, replaceable tracks. Import or record samples, edit them non-destructively, then recognize melody, bass, or beatbox performances into editable tracks with confidence, timing/pitch correction, and the original audio retained. Recording includes count-in, metronome, loop-length capture, and layered track controls. The local YIN pitch tracker and broad rule-based percussion classifier are replaceable through the recognition adapter; no cloud processing or third-party model is bundled. See `plan.md` for the roadmap, `docs/sound-library-spec.md` for the Sound Library, sample editor and recognition specs, `docs/research.md` for the market research and `docs/architecture.md` for the architecture.

## Essential Commands
- Install: `npm install`
- Run: `npm run dev`
- Test: `npm test`
- Build: `npm run build` (writes index.html + assets/ to repo root for GitHub Pages at /MusicMaker/; commit the output. Source entry: app/index.html)
