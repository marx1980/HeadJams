# MusicMaker

A simple, beginner-friendly music-making app (web/PWA first). Pick a channel, choose or record a sound, set note length, and build loops.

Choose a visual skin from **Project menu → Settings → Appearance**. Eight skins are available; your choice is saved locally on this device and does not alter project data.

Phases 0–4 (beat maker, tutorials, sampling, composition, sound shaping), Phase 7 guitar chords, Phase 8 Sample Editor, Phase 9 editor hardening, Phase 10 on-device audio recognition, Phase 11 arrangement assistance, and Phase 12 hardening are complete. Arrangement suggestions create separate, identifiable, replaceable, and removable tracks. Export offline WAV files at 44.1, 48, or 96 kHz in 16- or 24-bit PCM, with optional peak normalization; export rendering runs in a worker. Import or record samples, edit them non-destructively, then recognize melody, bass, or beatbox performances into editable tracks with confidence, timing/pitch correction, and the original audio retained. Recording includes count-in, metronome, loop-length capture, and layered track controls. The local YIN pitch tracker and broad rule-based percussion classifier are replaceable through the recognition adapter; no cloud processing or third-party model is bundled. See `plan.md` for the roadmap, `docs/sound-library-spec.md` for the Sound Library, sample editor and recognition specs, `docs/research.md` for the market research, `docs/architecture.md` for the architecture, and `docs/privacy.md` and `docs/deployment.md` for local data handling and release checks.

Every screen has a **? Help** button that opens the tutorial hub: browse by feature (Actions) or by goal (Workflows, e.g. make a song). Progress is saved locally.

## MIDI keyboard

Connect a MIDI keyboard from the Beat screen in a browser with Web MIDI support or in the Capacitor Android/iOS app. Choose the destination channel, start MIDI recording, play, then stop; captured notes are quantized to the current grid and saved into the selected pattern. MIDI access requires a device and browser permission.

## Essential Commands
- Install: `npm install`
- Run: `npm run dev`
- Test: `npm test`
- Build: `npm run build` (writes the GitHub Pages site to `dist/`; source entry: `app/index.html`)
- Mobile build and sync: `npm run build:mobile` (builds with relative asset paths and syncs Capacitor projects)

## Capacitor builds

Install Android Studio and its Android SDK to build/run `android/`. Build iOS with Xcode on macOS from `ios/App/`. After changing web code, run `npm run build:mobile`, then open the native project in its IDE. Native MIDI uses the Capacitor MIDI plugin; the browser version requires Web MIDI support and a secure context. Android/iOS packaging still requires the platform IDE and signing setup.
