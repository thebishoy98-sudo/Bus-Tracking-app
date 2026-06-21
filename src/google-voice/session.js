import fs from 'node:fs';
import path from 'node:path';
import { AUTH, URLS } from './selectors.js';
import { BROWSER_STATES } from './types.js';

// A minimal promise-chaining mutex so all page operations run one at a time.
// Google Voice is a single shared tab; concurrent navigation/clicks corrupt it.
class Mutex {
  constructor() { this.tail = Promise.resolve(); }
  runExclusive(fn) {
    const run = this.tail.then(fn, fn);
    // Keep the chain alive even if fn rejects.
    this.tail = run.then(() => {}, () => {});
    return run;
  }
}

async function anyPresent(page, selectors) {
  for (const sel of selectors) {
    try {
      if (await page.$(sel)) return true;
    } catch { /* selector engine hiccup — treat as absent */ }
  }
  return false;
}

// Lazily pull in the real Playwright launcher only when no fake is injected.
async function defaultOpenContext(opts) {
  const { openPersistentContext } = await import('./browser.js');
  return openPersistentContext(opts);
}

export class GoogleVoiceSession {
  constructor({ store, config, openContext = defaultOpenContext, now = () => new Date().toISOString(), logger = console } = {}) {
    this.store = store;
    this.config = config;
    this.openContext = openContext;
    this.now = now;
    this.log = logger;
    this.mutex = new Mutex();
    this.context = null;
    this.page = null;
    this.lastState = BROWSER_STATES.UNKNOWN;
    this.screenshotCount = 0;
    this.maxScreenshots = 20;
  }

  async _ensureContext() {
    if (!this.context) {
      const { context, page } = await this.openContext({
        profilePath: this.config.browserProfilePath,
      });
      this.context = context;
      this.page = page;
    }
    return this.page;
  }

  // Run a function with exclusive access to the (single) page.
  async withPage(fn) {
    return this.mutex.runExclusive(async () => {
      const page = await this._ensureContext();
      return fn(page);
    });
  }

  // Inspect the current DOM and classify the session state. Pure read; no writes.
  async detectState(page) {
    if (await anyPresent(page, AUTH.challengeIndicators)) return BROWSER_STATES.CHALLENGED;
    if (await anyPresent(page, AUTH.loginIndicators)) return BROWSER_STATES.LOGGED_OUT;
    if (await anyPresent(page, AUTH.readyIndicators)) return BROWSER_STATES.READY;
    return BROWSER_STATES.ERROR;
  }

  // Navigate to the messaging surface, classify state, and persist health.
  // Returns the detected BrowserState. Never throws on a bad state.
  async ensureReady() {
    return this.withPage(async (page) => {
      try {
        await page.goto(URLS.messages);
      } catch (err) {
        this.lastState = BROWSER_STATES.ERROR;
        this._writeState(BROWSER_STATES.ERROR, `navigation failed: ${err.message}`);
        return BROWSER_STATES.ERROR;
      }
      const state = await this.detectState(page);
      this.lastState = state;

      if (state === BROWSER_STATES.READY) {
        this._writeState(state, '');
      } else {
        const reason = (state === BROWSER_STATES.LOGGED_OUT || state === BROWSER_STATES.CHALLENGED)
          ? 'login required'
          : 'unexpected layout / selector failure';
        const shot = await this._screenshot(page, state);
        this._writeState(state, reason, shot);
      }
      return state;
    });
  }

  async isReady() {
    return (await this.ensureReady()) === BROWSER_STATES.READY;
  }

  _writeState(state, error, screenshotPath) {
    this.store.setHealth('browser_state', state);
    this.store.setHealth('last_state_at', this.now());
    this.store.setHealth('last_scan_ok', state === BROWSER_STATES.READY ? '1' : '0');
    this.store.setHealth('last_error', error || '');
    if (screenshotPath !== undefined) this.store.setHealth('last_screenshot', screenshotPath || '');
  }

  // Record the outcome of a polling/processing cycle separately from auth state.
  recordScan(ok, error = '') {
    this.store.setHealth('last_scan_ok', ok ? '1' : '0');
    this.store.setHealth('last_scan_at', this.now());
    if (ok) this.store.setHealth('last_error', '');
    else if (error) this.store.setHealth('last_error', error);
  }

  // Bounded diagnostic screenshot. Named only by state — never by message
  // content — so no customer data leaks into the diagnostics directory.
  async _screenshot(page, label) {
    if (this.screenshotCount >= this.maxScreenshots) return '';
    try {
      const dir = this.config.diagnosticsPath;
      fs.mkdirSync(dir, { recursive: true });
      const safeLabel = String(label).replace(/[^a-z0-9_-]/gi, '');
      const file = path.join(dir, `gv-${safeLabel}-${this.screenshotCount}.png`);
      await page.screenshot({ path: file });
      this.screenshotCount++;
      return file;
    } catch (err) {
      this.log.error?.('screenshot failed:', err.message);
      return '';
    }
  }

  async close() {
    try {
      if (this.context) await this.context.close();
    } finally {
      this.context = null;
      this.page = null;
    }
  }
}

export default GoogleVoiceSession;
