# Build and deployment

## Verify a change

Run `npm ci`, `npm test`, and `npm run build`. The build type-checks the TypeScript and writes the production site to the repository root (`index.html` and `assets/`).

The GitHub Actions workflow runs the test suite and production build on pushes and pull requests. A successful build verifies the configured `/MusicMaker/` asset base, but does not publish the site.

## Publish on GitHub Pages

1. Commit the production build output produced by `npm run build`.
2. In repository settings, configure Pages to publish the `main` branch from the repository root.
3. Open the published site and verify that the application and its generated JavaScript and CSS assets load under `/MusicMaker/`.

The project is a client-side app and currently has no service worker or offline cache. Validate recording, playback, sample persistence, and export in current desktop and mobile browsers before a release. Browser storage and available memory vary by device; large WAV exports may fail if the browser cannot allocate the required memory.
