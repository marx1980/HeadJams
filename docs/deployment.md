# Build and deployment

## Verify a change

Run `npm ci`, `npm test`, and `npm run build`. The build type-checks the TypeScript and writes the production site to the ignored `dist/` directory, separate from the source tree.

The GitHub Actions workflow runs the test suite and production build on pushes and pull requests. A push to `main` also publishes the `dist/` artifact to GitHub Pages.

## Publish on GitHub Pages

1. In repository settings, configure Pages to use **GitHub Actions** as the build and deployment source.
2. Push a validated change to `main` and wait for the `Validate` workflow's deployment job to complete.
3. Open the published site and verify that the application and its generated JavaScript and CSS assets load under `/MusicMaker/`.

The production app installs a service worker that caches the built app shell and same-origin assets for offline use. The built-in sound catalog is procedural code included in that shell; user sample audio remains in IndexedDB and project metadata in localStorage. Browser storage can be cleared or evicted, and samples are not synchronized between devices. The app must first be opened online to install the worker and cache the shell. Validate offline launch, recording, playback, sample persistence, and export in current desktop and mobile browsers before a release. Browser storage and available memory vary by device; large WAV exports may fail if the browser cannot allocate the required memory.
