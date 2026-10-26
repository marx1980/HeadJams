# MusicMaker

A simple, beginner-friendly music-making app (web/PWA first). Pick a channel, choose a sound, set note length, and build loops.

Phases 1 and 2 (beat maker, sample recording/import, and sound library) are complete. See `plan.md` for the roadmap, `docs/research.md` for the market research and `docs/architecture.md` for the architecture.

Record from a microphone or import an audio file in the sample panel. Trim and normalize it before saving; saved samples are kept in browser IndexedDB, while project sound references are saved with the project. Use the library search and tag filter to find sounds, or switch to Pad view to trigger them.

## Essential Commands
- Install: `npm install`
- Run: `npm run dev`
- Test: `npm test`
- Build: `npm run build`
