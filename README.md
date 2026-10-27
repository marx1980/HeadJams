# MusicMaker

A simple, beginner-friendly music-making app (web/PWA first). Pick a channel, choose or record a sound, set note length, and build loops.

Phases 0–4 (beat maker, tutorials, sampling, composition, sound shaping), Phase 7 guitar chords, Phase 8 Sample Editor, Phase 9 editor hardening, Phase 10 on-device audio recognition, Phase 11 arrangement assistance, and Phase 12 hardening are complete. Arrangement suggestions create separate, identifiable, replaceable, and removable tracks. Export offline WAV files at 44.1, 48, or 96 kHz in 16- or 24-bit PCM, with optional peak normalization; export rendering runs in a worker. Import or record samples, edit them non-destructively, then recognize melody, bass, or beatbox performances into editable tracks with confidence, timing/pitch correction, and the original audio retained. Recording includes count-in, metronome, loop-length capture, and layered track controls. The local YIN pitch tracker and broad rule-based percussion classifier are replaceable through the recognition adapter; no cloud processing or third-party model is bundled. See `plan.md` for the roadmap, `docs/sound-library-spec.md` for the Sound Library, sample editor and recognition specs, `docs/research.md` for the market research, `docs/architecture.md` for the architecture, and `docs/privacy.md` and `docs/deployment.md` for local data handling and release checks.

## Essential Commands
- Install: `npm install`
- Run: `npm run dev`
- Test: `npm test`
- Build: `npm run build` (writes the GitHub Pages site to `dist/`; source entry: `app/index.html`)
- Build Capacitor web assets: `npm run build:capacitor`
- Sync Capacitor native projects after building: `npm run cap:sync`
- Build Android or iOS: `npm run cap:build:android` or `npm run cap:build:ios`
- Open native projects: `npm run cap:open:android` or `npm run cap:open:ios`

MIDI note input is available in browsers that implement the Web MIDI API and grant device permission; captured notes are quantized onto the selected track. MIDI output and drum maps are not included. Capacitor projects are under `android/` and `ios/`; native builds require Android Studio/SDK or Xcode, and iOS builds require macOS.
