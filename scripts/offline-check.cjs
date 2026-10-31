// Offline acceptance check (plan.md milestone E, synthesisvAI_2.md §54): with the network off, the installed app
// opens, plays a project on every bundled sampled instrument, and saves and reopens it.
// Needs Playwright with Chromium and a preview server:
//   npx vite build && npx vite preview --port 5199 &  node scripts/offline-check.cjs
const { chromium } = require('playwright');
const URL_ = process.env.APP_URL ?? 'http://localhost:5199/HeadJams/';
const PROJECT_KEY = 'musicmaker.project.v4';

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('musicmaker.tutorialSeen', '1'));
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  // Download every instrument from Settings › Offline.
  await page.click('[aria-label="Settings"]');
  await page.click('#offline-download');
  await page.waitForFunction(() => document.querySelector('#offline-download')?.textContent === 'Downloaded', null, { timeout: 120000 });
  const count = await page.textContent('#offline-count');

  // A project that uses every sampled sound family: one channel per instrument with a few notes.
  const ids = await page.evaluate(async (key) => {
    const project = JSON.parse(localStorage.getItem(key));
    const sounds = ['grand-piano', 'electric-piano', 'electric-bass', 'strings', 'brass', 'nylon-guitar', 'clean-guitar', 'harp', 'flute', 'clarinet', 'french-horn', 'church-organ', 'marimba', 'glockenspiel', 'pizzicato-strings'];
    project.channels = sounds.map((soundId, index) => ({
      id: `off-${index}`, name: soundId, soundId, volume: 0.7, pan: 0, mute: false, solo: false,
      steps: Array(project.noteLength * project.loopBars).fill(false),
      notes: [0, 4, 8].map((step, n) => ({ id: `n${index}-${n}`, step, pitch: 48 + index * 2 + n * 4, durationSteps: 3 })),
    }));
    const length = project.noteLength * project.loopBars;
    project.channels.push({ id: 'off-kit', name: 'acoustic-kick', soundId: 'acoustic-kick', volume: 0.8, pan: 0, mute: false, solo: false,
      steps: Array.from({ length }, (_, step) => step % 4 === 0), notes: [] });
    localStorage.setItem(key, JSON.stringify(project));
    return [...sounds, 'acoustic-kick'];
  }, PROJECT_KEY);

  await context.setOffline(true);
  const failed = [];
  page.on('requestfailed', (request) => failed.push(request.url()));
  await page.reload();
  await page.waitForSelector('.strip');
  const strips = await page.locator('.strip').count();
  await page.click('button.play');
  await page.waitForTimeout(2500);
  const toast = await page.locator('.toast').allTextContents();
  const playing = await page.locator('button.play').textContent();
  await page.click('button.play');

  // Save, close and reopen offline.
  await page.fill('[aria-label^="Track name"] >> nth=0', 'Offline piano');
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('.strip');
  const name = await page.inputValue('[aria-label^="Track name"] >> nth=0');

  const result = {
    count, instruments: ids.length, strips, playing, toast, reopenedName: name,
    failedInstrumentRequests: failed.filter((url) => url.includes('/instruments/')), errors,
  };
  console.log(JSON.stringify(result, null, 1));
  const ok = strips === ids.length && /Stop/.test(playing ?? '') && !toast.some((text) => /unavailable/i.test(text))
    && name === 'Offline piano' && result.failedInstrumentRequests.length === 0 && errors.length === 0;
  await browser.close();
  console.log(ok ? 'OFFLINE OK' : 'OFFLINE FAILED');
  process.exit(ok ? 0 : 1);
})();
