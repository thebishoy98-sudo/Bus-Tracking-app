import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  encryptDirectory,
  isDirectoryEmpty,
  restoreEncryptedProfile,
} from '../src/profile-archive.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gv-profile-archive-'));
}

test('isDirectoryEmpty treats missing and empty directories as empty', () => {
  const root = tempDir();
  const missing = path.join(root, 'missing');
  const empty = path.join(root, 'empty');
  const full = path.join(root, 'full');
  fs.mkdirSync(empty);
  fs.mkdirSync(full);
  fs.writeFileSync(path.join(full, 'file.txt'), 'x');

  assert.equal(isDirectoryEmpty(missing), true);
  assert.equal(isDirectoryEmpty(empty), true);
  assert.equal(isDirectoryEmpty(full), false);
});

test('restoreEncryptedProfile no-ops when archive path or password is missing', async () => {
  const root = tempDir();
  const targetDir = path.join(root, 'target');

  const missingArchive = await restoreEncryptedProfile({
    archivePath: '',
    targetDir,
    password: 'secret',
  });
  const missingPassword = await restoreEncryptedProfile({
    archivePath: path.join(root, 'profile.tar.gz.enc'),
    targetDir,
    password: '',
  });

  assert.equal(missingArchive.restored, false);
  assert.equal(missingArchive.reason, 'missing_config');
  assert.equal(missingPassword.restored, false);
  assert.equal(missingPassword.reason, 'missing_config');
  assert.equal(fs.existsSync(targetDir), false);
});

test('restoreEncryptedProfile no-ops when target profile already contains files', async () => {
  const root = tempDir();
  const sourceDir = path.join(root, 'source');
  const targetDir = path.join(root, 'target');
  const archivePath = path.join(root, 'profile.tar.gz.enc');
  fs.mkdirSync(sourceDir);
  fs.mkdirSync(targetDir);
  fs.writeFileSync(path.join(sourceDir, 'Default'), 'profile');
  fs.writeFileSync(path.join(targetDir, 'existing'), 'keep');

  await encryptDirectory({ sourceDir, archivePath, password: 'secret' });
  const result = await restoreEncryptedProfile({ archivePath, targetDir, password: 'secret' });

  assert.equal(result.restored, false);
  assert.equal(result.reason, 'target_not_empty');
  assert.equal(fs.readFileSync(path.join(targetDir, 'existing'), 'utf8'), 'keep');
  assert.equal(fs.existsSync(path.join(targetDir, 'Default')), false);
});

test('encryptDirectory and restoreEncryptedProfile round-trip a profile directory', async () => {
  const root = tempDir();
  const sourceDir = path.join(root, 'source');
  const targetDir = path.join(root, 'target');
  const nested = path.join(sourceDir, 'Default');
  const archivePath = path.join(root, 'profile.tar.gz.enc');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, 'Cookies'), 'signed-in-cookie-state');

  await encryptDirectory({ sourceDir, archivePath, password: 'secret' });
  const result = await restoreEncryptedProfile({ archivePath, targetDir, password: 'secret' });

  assert.equal(result.restored, true);
  assert.equal(result.reason, 'restored');
  assert.equal(fs.readFileSync(path.join(targetDir, 'Default', 'Cookies'), 'utf8'), 'signed-in-cookie-state');
});
