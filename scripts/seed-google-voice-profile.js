// Seed the persistent Google Voice browser profile — locally and interactively.
//
// This opens a real (headed) Chromium using the SAME persistent profile
// directory the service uses (GV_PROFILE_PATH). You sign in to Google and
// Google Voice BY HAND, complete any 2-step verification, and confirm you can
// see your Messages. When you close the window, the logged-in session (cookies,
// local storage) is saved into the profile directory.
//
// IMPORTANT:
//   * This app NEVER stores your Google password and NEVER bypasses MFA.
//     You authenticate yourself in the browser; only the resulting session
//     state persists in the profile directory.
//   * After seeding locally, copy the profile directory onto the server's
//     /data disk (or run this on a machine with a display and sync the folder)
//     so the headless service can reuse the session.

import { config } from '../src/config.js';

async function main() {
  const { chromium } = await import('playwright');
  const profilePath = config.browserProfilePath;

  console.log(`\nOpening Chromium with persistent profile:\n  ${profilePath}\n`);
  console.log('1) Sign in to your Google account and open https://voice.google.com/messages');
  console.log('2) Complete any 2-step verification.');
  console.log('3) Make sure you can see your text conversations.');
  console.log('4) Then close the browser window to save the session.\n');

  const context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    viewport: { width: 1280, height: 1000 },
    args: ['--disable-dev-shm-usage'],
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://voice.google.com/messages').catch(() => {});

  // Resolve when the user closes the browser/all pages.
  await new Promise((resolve) => {
    context.on('close', resolve);
    page.on('close', () => {
      // If the last page closes, close the context too.
      if (context.pages().length === 0) context.close().catch(() => {});
    });
  });

  console.log('\nProfile saved. The service can now reuse this logged-in session.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seeding failed:', err.message);
  console.error('If Playwright browsers are missing, run: npx playwright install chromium');
  process.exit(1);
});
