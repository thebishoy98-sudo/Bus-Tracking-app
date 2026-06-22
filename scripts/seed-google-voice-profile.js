// Seed the persistent Google Voice browser profile — locally and interactively.
//
// This opens installed stable Chrome using the SAME persistent profile
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
import { spawn } from 'node:child_process';
import { buildChromeArgs, findStableChrome, resolveProfilePath } from './profile-seed.js';

async function main() {
  const profilePath = resolveProfilePath(config.browserProfilePath);
  const executable = findStableChrome();
  if (!executable) {
    throw new Error('Stable Google Chrome was not found. Install Chrome or set GV_CHROME_PATH.');
  }

  console.log(`\nOpening stable Chrome with persistent profile:\n  ${profilePath}\n`);
  console.log('1) Sign in to your Google account and open https://voice.google.com/messages');
  console.log('2) Complete any 2-step verification.');
  console.log('3) Make sure you can see your text conversations.');
  console.log('4) Then close the browser window to save the session.\n');

  const chrome = spawn(executable, buildChromeArgs(profilePath), { stdio: 'inherit' });
  await new Promise((resolve, reject) => {
    chrome.once('error', reject);
    chrome.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Chrome exited with code ${code}`)));
  });

  console.log('\nProfile saved. The service can now reuse this logged-in session.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});
