import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encryptJsonFile } from '../src/profile-archive.js';
import { applyStorageState, readStorageStateFromEnv } from '../src/google-voice/storage-state.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gv-storage-state-'));
}

test('readStorageStateFromEnv no-ops when config is missing', () => {
  const result = readStorageStateFromEnv({});

  assert.equal(result.loaded, false);
  assert.equal(result.reason, 'missing_config');
});

test('readStorageStateFromEnv decrypts storage state with profile archive password fallback', () => {
  const root = tempDir();
  const archivePath = path.join(root, 'state.json.enc');
  const state = { cookies: [{ name: 'SID', value: 'cookie', domain: '.google.com', path: '/' }], origins: [] };
  encryptJsonFile({ value: state, archivePath, password: 'secret' });

  const result = readStorageStateFromEnv({
    GV_STORAGE_STATE_PATH: archivePath,
    GV_PROFILE_ARCHIVE_PASSWORD: 'secret',
  });

  assert.equal(result.loaded, true);
  assert.deepEqual(result.state, state);
});

test('applyStorageState adds cookies to a browser context', async () => {
  const calls = [];
  const context = { addCookies: async (cookies) => calls.push(cookies) };
  const state = { cookies: [{ name: 'SID', value: 'cookie', domain: '.google.com', path: '/' }] };

  const result = await applyStorageState(context, state);

  assert.equal(result.applied, true);
  assert.equal(result.cookies, 1);
  assert.deepEqual(calls, [state.cookies]);
});
