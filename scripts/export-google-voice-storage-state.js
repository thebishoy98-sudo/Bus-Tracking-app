import { chromium } from 'playwright';
import { config } from '../src/config.js';
import { URLS } from '../src/google-voice/selectors.js';
import { encryptJsonFile } from '../src/profile-archive.js';

const archivePath = process.env.GV_STORAGE_STATE_PATH || './secrets/gv-storage-state.json.enc';
const password = process.env.GV_STORAGE_STATE_PASSWORD || process.env.GV_PROFILE_ARCHIVE_PASSWORD || '';
if (!password) {
  console.error('GV_STORAGE_STATE_PASSWORD or GV_PROFILE_ARCHIVE_PASSWORD is required.');
  process.exit(1);
}

const context = await chromium.launchPersistentContext(config.browserProfilePath, {
  headless: false,
  viewport: { width: 1280, height: 1000 },
});
try {
  const page = context.pages()[0] || await context.newPage();
  await page.goto(URLS.messages, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForTimeout(5000);
  const state = await context.storageState();
  encryptJsonFile({ value: state, archivePath, password });
  console.log(`Encrypted Google Voice storage state written to ${archivePath} with ${state.cookies.length} cookies.`);
} finally {
  await context.close();
}
