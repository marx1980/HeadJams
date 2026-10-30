# MusicMaker: instructions for Claude sessions

## Git setup (do this right after cloning)
The sandbox clone tracks only `main`, so after a branch is pushed there is no `origin/<branch>` ref and the stop hook wrongly reports pushed commits as unpushed. Run once per clone:

`git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*' && git fetch --depth=1 origin`

## Pull requests
- `gh pr create` and other GraphQL commands are blocked. Open a PR with `gh api repos/marx1980/MusicMaker/pulls -f title=... -f head=BRANCH -f base=main -f body=...`.
- Merge PRs yourself through the REST API (squash): `gh api -X PUT repos/marx1980/MusicMaker/pulls/N/merge -f merge_method=squash`.
- Work on a branch, never directly on `main`.

## Running and checking the UI
- `npm run dev` does not load the app (the `app/` root cannot resolve `../src/main.tsx`). Use `npx vite build`, then `npx vite preview --port 5199` and open `http://localhost:5199/MusicMaker/`.
- Before finishing: `npx tsc --noEmit` and `npm test`.
- Check layout changes at 320, 390 and 430px wide. Only Chromium is available in the sandbox, not iOS WebKit.

## UI rules
Follow `skill.md` (layout rules) and keep on-screen text to labels and values, with no explanatory paragraphs. `plan.md` is the roadmap.

## Sampled instruments
- Bundled instruments go in `app/public/instruments/<id>/` with `manifest.json`, audio files and `LICENCE.txt`. Only redistributable licences (the repo is public); see `expansion.md` §5.
- `npm test` validates every bundled manifest and checks the download budget. Regenerate the test instrument with `node scripts/make-test-instrument.mjs`.
- Instruments built from third-party sources have a build script (e.g. `scripts/build-acoustic-kit.py`, needs git, ffmpeg, numpy) and record the source commit in `manifest.json` provenance. Use WAV for drums (compressed formats add start padding that makes hits late). SFZ sources import with `scripts/sfz-import.py` (see `scripts/build-guitars.sh`).
- Existing projects must keep rendering identically: compare WAV render hashes before and after any change to `performance.ts`, `render.ts` or `engine.ts`.

## Hum-to-music must keep working (`hum.md`)
After any change to audio, recognition, recording or the Library/Beat UI, run the browser check: import a hummed-style WAV (generate one, e.g. sine notes C D E G E D C C with slight vibrato) → save in the Sample editor → recognise as Melody → confirm a melody track with the right notes appears and the original is kept. Report the detected notes.

Also check the Capture flow end to end: launch Chromium with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=<hum.wav at 48 kHz>`, then Capture → Record → Stop → Melody, and confirm the Cleaned notes (C D E G E D C C) land on a new track.
