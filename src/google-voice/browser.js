// Real Playwright launcher for the persistent Google Voice browser context.
//
// This is the only module that imports Playwright. It is loaded lazily by the
// session (via dynamic import) so unit tests can inject a fake context without
// requiring Chromium to be installed.

import { URLS } from './selectors.js';

export async function openPersistentContext({ profilePath, headless = true } = {}) {
  const { chromium } = await import('playwright');
  const context = await chromium.launchPersistentContext(profilePath, {
    headless,
    viewport: { width: 1280, height: 1000 },
    // Render containers need these to run Chromium without a real GPU/IPC namespace.
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    acceptDownloads: true,
  });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(30_000);
  return { context, page, baseUrl: URLS.messages };
}

export default { openPersistentContext };
