import { normalizePhone } from './normalize.js';
import { COMPOSER, URLS } from './selectors.js';
import { BROWSER_STATES } from './types.js';

// Orchestrate a single send against a composer `driver`. The driver is an
// abstraction over the Google Voice DOM so this logic is fully unit-testable;
// the real driver is built by browserComposer() below.
//
// SAFETY: the selected conversation's recipient number MUST equal the queued
// recipient immediately before submission, or we abort without sending.
export async function sendMessage(driver, { recipient, body, kind, attachmentPath }) {
  const want = normalizePhone(recipient);

  const state = await driver.ensureReady();
  if (state !== BROWSER_STATES.READY) {
    const loginRequired = state === BROWSER_STATES.LOGGED_OUT || state === BROWSER_STATES.CHALLENGED;
    return { ok: false, loginRequired, state };
  }

  await driver.openConversation(want);

  const selected = normalizePhone(await driver.readSelectedRecipient());
  if (!selected || selected !== want) {
    return { ok: false, recipientMismatch: true, selected: selected || null };
  }

  await driver.typeMessage(body || '');
  if (kind === 'image' && attachmentPath) {
    await driver.attachImage(attachmentPath);
  }
  await driver.submit();

  const confirmed = await driver.confirmSent();
  if (!confirmed) return { ok: false, error: 'send not confirmed by UI' };
  return { ok: true };
}

// A sender object suitable for the outbox drain: { send(job) -> result }.
export class GoogleVoiceSender {
  constructor({ driver }) { this.driver = driver; }
  send(job) { return sendMessage(this.driver, job); }
}

// Build the real composer driver from a live GoogleVoiceSession. Navigation and
// selectors here are best-effort and verified during the live smoke test.
export function browserComposer(session) {
  return {
    async ensureReady() { return session.ensureReady(); },
    async openConversation(recipient) {
      return session.withPage(async (page) => {
        // Open the conversation for this number; the live test confirms the URL/flow.
        await page.goto(`${URLS.messages}`);
        await page.click(COMPOSER.recipientInput).catch(() => {});
        await page.fill(COMPOSER.recipientInput, recipient).catch(() => {});
      });
    },
    async readSelectedRecipient() {
      return session.withPage(async (page) => {
        const chip = await page.$(COMPOSER.recipientChip);
        if (!chip) return '';
        return (await chip.textContent()) || '';
      });
    },
    async typeMessage(body) {
      return session.withPage(async (page) => { await page.fill(COMPOSER.textInput, body); });
    },
    async attachImage(filePath) {
      return session.withPage(async (page) => {
        const input = await page.$(COMPOSER.fileInput);
        if (input) await input.setInputFiles(filePath);
      });
    },
    async submit() {
      return session.withPage(async (page) => { await page.click(COMPOSER.sendButton); });
    },
    async confirmSent() {
      return session.withPage(async (page) => {
        const confirmation = await page.waitForSelector(COMPOSER.sentConfirmation, { timeout: 15_000 }).catch(() => null);
        return !!confirmation;
      });
    },
  };
}

export default { sendMessage, GoogleVoiceSender, browserComposer };
