import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db.js';
import { GoogleVoiceSession } from '../src/google-voice/session.js';
import { AUTH } from '../src/google-voice/selectors.js';

const READY_SEL = AUTH.readyIndicators[0];
const LOGIN_SEL = AUTH.loginIndicators[0];
const CHALLENGE_SEL = AUTH.challengeIndicators[0];

// A fake Playwright page that reports a fixed set of present selectors.
function fakePage(presentSelectors = [], shots = []) {
  return {
    gotoCount: 0,
    async goto() { this.gotoCount++; },
    async $(sel) { return presentSelectors.includes(sel) ? { __el: sel } : null; },
    async screenshot({ path: p }) { shots.push(p); return Buffer.from(''); },
    url() { return 'https://voice.google.com/u/0/messages'; },
  };
}

function makeSession(presentSelectors, { shots = [] } = {}) {
  const store = openDatabase(':memory:').store;
  let opens = 0;
  const page = fakePage(presentSelectors, shots);
  const context = { closed: false, async close() { this.closed = true; } };
  const openContext = async () => { opens++; return { context, page }; };
  const config = {
    browserProfilePath: path.join(os.tmpdir(), 'gv-test-profile'),
    diagnosticsPath: path.join(os.tmpdir(), 'gv-test-diag-' + Math.floor(process.hrtime()[1])),
  };
  const session = new GoogleVoiceSession({
    store, config, openContext,
    now: () => '2026-06-21T10:00:00Z',
    logger: { log() {}, error() {} },
  });
  return { session, store, page, context, shots, opensRef: () => opens };
}

test('ready state is detected and recorded as healthy', async () => {
  const { session, store } = makeSession([READY_SEL]);
  const state = await session.ensureReady();
  assert.equal(state, 'ready');
  assert.equal(store.getHealth('browser_state'), 'ready');
  assert.equal(store.getHealth('last_scan_ok'), '1');
  assert.equal(store.getHealth('last_error'), '');
});

test('logged-out state requires login and captures a screenshot', async () => {
  const shots = [];
  const { session, store } = makeSession([LOGIN_SEL], { shots });
  const state = await session.ensureReady();
  assert.equal(state, 'logged_out');
  assert.equal(store.getHealth('browser_state'), 'logged_out');
  assert.equal(store.getHealth('last_error'), 'login required');
  assert.equal(store.getHealth('last_scan_ok'), '0');
  assert.equal(shots.length, 1, 'a diagnostic screenshot is captured');
});

test('challenge state is distinct from logged out', async () => {
  const { session, store } = makeSession([CHALLENGE_SEL]);
  const state = await session.ensureReady();
  assert.equal(state, 'challenged');
  assert.equal(store.getHealth('browser_state'), 'challenged');
  assert.equal(store.getHealth('last_error'), 'login required');
});

test('unknown layout (selector failure) records an error state', async () => {
  const { session, store } = makeSession([]);
  const state = await session.ensureReady();
  assert.equal(state, 'error');
  assert.equal(store.getHealth('browser_state'), 'error');
  assert.match(store.getHealth('last_error'), /layout|selector/i);
});

test('isReady reflects the last detected state', async () => {
  const { session } = makeSession([READY_SEL]);
  assert.equal(await session.isReady(), true);
});

test('the browser context is opened once and reused', async () => {
  const { session, opensRef } = makeSession([READY_SEL]);
  await session.ensureReady();
  await session.ensureReady();
  await session.withPage(async () => {});
  assert.equal(opensRef(), 1);
});

test('withPage serializes access via a mutex', async () => {
  const { session } = makeSession([READY_SEL]);
  let active = 0;
  let maxActive = 0;
  const task = () => session.withPage(async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
  });
  await Promise.all([task(), task(), task()]);
  assert.equal(maxActive, 1, 'only one page operation runs at a time');
});

test('recordScan persists success and failure outcomes', async () => {
  const { session, store } = makeSession([READY_SEL]);
  session.recordScan(true);
  assert.equal(store.getHealth('last_scan_ok'), '1');
  assert.ok(store.getHealth('last_scan_at'));
  session.recordScan(false, 'parse blew up');
  assert.equal(store.getHealth('last_scan_ok'), '0');
  assert.equal(store.getHealth('last_error'), 'parse blew up');
});
