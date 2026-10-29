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
- Existing projects must keep rendering identically: compare WAV render hashes before and after any change to `performance.ts`, `render.ts` or `engine.ts`.
