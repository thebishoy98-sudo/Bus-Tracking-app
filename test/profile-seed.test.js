import test from 'node:test';
import assert from 'node:assert/strict';

import { buildChromeArgs, resolveProfilePath } from '../scripts/profile-seed.js';

test('profile seeding opens stable Chrome without automation flags', () => {
  const args = buildChromeArgs('C:\\tmp\\gv-profile');

  assert.deepEqual(args, [
    '--user-data-dir=C:\\tmp\\gv-profile',
    '--no-first-run',
    '--new-window',
    'https://voice.google.com/messages',
  ]);
  assert.ok(!args.some((arg) => arg.includes('remote-debugging')));
});

test('profile seeding resolves the dedicated profile to an absolute path', () => {
  assert.equal(
    resolveProfilePath('./.gv-profile', 'C:\\repo'),
    'C:\\repo\\.gv-profile',
  );
});
