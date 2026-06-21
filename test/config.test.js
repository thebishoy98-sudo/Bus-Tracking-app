import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConfig, normalizeOwnerNumber } from '../src/config.js';

// A minimal env that satisfies the required secrets so buildConfig() never throws
// while we exercise the optional, defaulted fields.
const baseEnv = {
  ANTHROPIC_API_KEY: 'sk-test',
  GOOGLE_CLIENT_ID: 'cid',
  GOOGLE_CLIENT_SECRET: 'secret',
};

test('normalizeOwnerNumber reduces any format to 10 digits', () => {
  assert.equal(normalizeOwnerNumber('732-822-8376'), '7328228376');
  assert.equal(normalizeOwnerNumber('(732) 822-8376'), '7328228376');
  assert.equal(normalizeOwnerNumber('+1 732 822 8376'), '7328228376');
  assert.equal(normalizeOwnerNumber('17328228376'), '7328228376');
  assert.equal(normalizeOwnerNumber('7328228376'), '7328228376');
});

test('normalizeOwnerNumber returns empty string for junk', () => {
  assert.equal(normalizeOwnerNumber(''), '');
  assert.equal(normalizeOwnerNumber(null), '');
  assert.equal(normalizeOwnerNumber('hello'), '');
});

test('owner number defaults to the designated owner line', () => {
  const config = buildConfig({ ...baseEnv });
  assert.equal(config.ownerNumber, '7328228376');
});

test('owner number is normalized from OWNER_PHONE_NUMBER', () => {
  const config = buildConfig({ ...baseEnv, OWNER_PHONE_NUMBER: '(908) 555-1212' });
  assert.equal(config.ownerNumber, '9085551212');
});

test('browser profile path has a default and is overridable', () => {
  assert.equal(buildConfig({ ...baseEnv }).browserProfilePath, './.gv-profile');
  assert.equal(
    buildConfig({ ...baseEnv, GV_PROFILE_PATH: '/data/google-voice-profile' }).browserProfilePath,
    '/data/google-voice-profile',
  );
});

test('media path has a default and is overridable', () => {
  assert.equal(buildConfig({ ...baseEnv }).mediaPath, './media');
  assert.equal(buildConfig({ ...baseEnv, MEDIA_PATH: '/data/media' }).mediaPath, '/data/media');
});

test('diagnostics path has a default and is overridable', () => {
  assert.equal(buildConfig({ ...baseEnv }).diagnosticsPath, './diagnostics');
  assert.equal(
    buildConfig({ ...baseEnv, DIAGNOSTICS_PATH: '/data/diagnostics' }).diagnosticsPath,
    '/data/diagnostics',
  );
});

test('observation mode defaults to true and only explicit falsey disables it', () => {
  assert.equal(buildConfig({ ...baseEnv }).observationMode, true);
  assert.equal(buildConfig({ ...baseEnv, OBSERVATION_MODE: 'true' }).observationMode, true);
  assert.equal(buildConfig({ ...baseEnv, OBSERVATION_MODE: 'false' }).observationMode, false);
  assert.equal(buildConfig({ ...baseEnv, OBSERVATION_MODE: '0' }).observationMode, false);
  assert.equal(buildConfig({ ...baseEnv, OBSERVATION_MODE: 'no' }).observationMode, false);
});

test('dashboard credentials come from the environment', () => {
  const config = buildConfig({ ...baseEnv, DASHBOARD_USER: 'shop', DASHBOARD_PASSWORD: 'hunter2' });
  assert.equal(config.dashboardUser, 'shop');
  assert.equal(config.dashboardPassword, 'hunter2');
});

test('polling interval defaults to 60 seconds and is overridable', () => {
  assert.equal(buildConfig({ ...baseEnv }).pollIntervalSeconds, 60);
  assert.equal(buildConfig({ ...baseEnv, POLL_INTERVAL_SECONDS: '30' }).pollIntervalSeconds, 30);
});

test('send rate defaults and is overridable', () => {
  assert.equal(buildConfig({ ...baseEnv }).sendRatePerMinute, 6);
  assert.equal(buildConfig({ ...baseEnv, SEND_RATE_PER_MINUTE: '2' }).sendRatePerMinute, 2);
});

test('media retention defaults to 90 days and is overridable', () => {
  assert.equal(buildConfig({ ...baseEnv }).mediaRetentionDays, 90);
  assert.equal(buildConfig({ ...baseEnv, MEDIA_RETENTION_DAYS: '30' }).mediaRetentionDays, 30);
});

test('image safety limits have sane defaults', () => {
  const config = buildConfig({ ...baseEnv });
  assert.equal(config.maxImagesPerMessage, 4);
  assert.ok(config.maxAttachmentBytes >= 1024 * 1024);
  assert.deepEqual(
    config.allowedImageMimes,
    ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  );
});

test('required secrets throw only when accessed', () => {
  const config = buildConfig({ GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'secret' });
  assert.throws(() => config.anthropicApiKey(), /ANTHROPIC_API_KEY/);
});
