// Real Playwright launcher for the persistent Google Voice browser context.
//
// This is the only module that imports Playwright. It is loaded lazily by the
// session (via dynamic import) so unit tests can inject a fake context without
// requiring Chromium to be installed.
//
// IMPORTANT: this must open the SAME browser binary the profile was seeded with
// (`scripts/seed-google-voice-profile.js` uses installed stable Chrome), so the
// signed-in session carries over. We therefore prefer installed Chrome
// (GV_CHROME_PATH or the "chrome" channel) and only fall back to Playwright's
// bundled Chromium if no Chrome is found.

import { URLS } from './selectors.js';
import { findStableChrome } from '../../scripts/profile-seed.js';

// Headless by default; set GV_HEADLESS=false (or run with a display) when a live
// Google session refuses to load headless.
function wantHeadless(env = process.env) {
  const v = env.GV_HEADLESS;
  if (v === undefined || v === '') return true;
  return !['false', '0', 'no', 'off'].includes(String(v).trim().toLowerCase());
}

export async function openPersistentContext({ profilePath, headless } = {}) {
  const { chromium } = await import('playwright');
  const isHeadless = headless === undefined ? wantHeadless() : headless;

  const launchOpts = {
    headless: isHeadless,
    viewport: { width: 1280, height: 1000 },
    // Render containers need these to run without a real GPU/IPC namespace.
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    acceptDownloads: true,
  };

  // Match the seed: use installed Chrome if we can find it.
  const explicit = process.env.GV_CHROME_PATH || findStableChrome();
  if (explicit) launchOpts.executablePath = explicit;
  else launchOpts.channel = 'chrome'; // let Playwright locate installed Chrome

  let context;
  try {
    context = await chromium.launchPersistentContext(profilePath, launchOpts);
  } catch (err) {
    // Last resort: bundled Chromium (profile may not carry the Chrome session).
    delete launchOpts.executablePath;
    delete launchOpts.channel;
    context = await chromium.launchPersistentContext(profilePath, launchOpts);
  }

  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(30_000);
  return { context, page, baseUrl: URLS.messages };
}

export default { openPersistentContext };
