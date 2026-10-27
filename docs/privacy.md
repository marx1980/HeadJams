# Privacy and local data

MusicMaker processes projects, recordings, samples, recognition, and audio exports in the browser. The shipped application does not send this content to a server or include analytics or third-party tracking scripts.

## What is stored

- Project data, instrument assignments, and recognition event metadata are saved in browser `localStorage` so the project can be restored on a later visit.
- Imported and recorded sample audio, including its original audio and processing settings, is stored in browser IndexedDB.
- Sound favourites, recent sounds, selected screen, and tutorial preferences are stored in `localStorage`.
- Microphone access is requested by the browser only when recording is started. The recording remains in the browser unless you choose to export it or otherwise share it.

This data is not encrypted by MusicMaker. Anyone with access to the same browser profile or same-origin page scripts may be able to access it. Browser storage can be removed using the browser's site-data controls; doing so permanently removes saved projects and samples. Storage quotas and eviction are controlled by the browser.

Recognition and WAV rendering run locally. The replaceable recognition adapter can support other implementations in the future; any separately installed or modified adapter should be reviewed for its own data handling before use.

## Limits

The app has no account, cloud sync, telemetry, or remote backup. Keep independent backups of work you cannot afford to lose. WAV export uses in-memory browser processing, so very large arrangements may exceed available memory; export at a lower sample rate or shorten the arrangement if that happens.
