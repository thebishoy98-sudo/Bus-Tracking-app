import { createHash } from 'node:crypto';
import { normalizePhone } from './normalize.js';

// Durable outbound queue: idempotent enqueue, sequential draining with recipient
// verification, bounded exponential backoff, rate limiting, and login-required
// suspension. Nothing is sent while the service is in observation mode.

const BACKOFF_BASE_SECONDS = 60;
const BACKOFF_CAP_SECONDS = 3600;

// Stable key so the same logical message is never enqueued (or sent) twice.
export function makeIdempotencyKey({ recipient, kind = 'text', body = '', attachmentPath = '', tag = '' }) {
  const parts = [normalizePhone(recipient) || recipient || '', kind, body || '', attachmentPath || '', tag || ''];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export function enqueueOutbound(store, { recipient, body = null, kind = 'text', attachmentPath = null, idempotencyKey }) {
  if (!idempotencyKey) {
    idempotencyKey = makeIdempotencyKey({ recipient, kind, body: body || '', attachmentPath: attachmentPath || '' });
  }
  return store.enqueueOutbox({
    idempotency_key: idempotencyKey,
    recipient_number: normalizePhone(recipient) || recipient,
    kind,
    body,
    attachment_path: attachmentPath,
  });
}

// Exponential backoff in seconds for the Nth (0-based) prior attempt, capped.
export function backoffSeconds(attempts) {
  return Math.min(BACKOFF_CAP_SECONDS, BACKOFF_BASE_SECONDS * Math.pow(2, Math.max(0, attempts)));
}

function isoPlusSeconds(nowIso, seconds) {
  const t = new Date(nowIso).getTime();
  return new Date(t + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// Drain queued sends. `sender` is any object with `send(job) -> result`, where
// result is { ok } | { loginRequired } | { recipientMismatch, selected } | { error }.
export async function drainOutbox({ store, sender, config, now = () => new Date().toISOString(), logger = console, max }) {
  if (config.observationMode) {
    return { observation: true, sent: 0, attempted: 0, suspended: false };
  }

  const limit = max ?? config.sendRatePerMinute ?? 6;
  const maxRetries = config.maxSendRetries ?? 5;
  let sent = 0;
  let attempted = 0;
  let suspended = false;

  for (let i = 0; i < limit; i++) {
    const row = store.claimNextOutbox(now());
    if (!row) break;
    attempted++;

    let result;
    try {
      result = await sender.send({
        recipient: row.recipient_number,
        body: row.body,
        kind: row.kind,
        attachmentPath: row.attachment_path,
      });
    } catch (err) {
      result = { ok: false, error: err.message };
    }

    if (result.ok) {
      store.markOutboxSent(row.id, now());
      sent++;
      continue;
    }

    if (result.loginRequired) {
      // Stop all browser work: re-auth is required before any further sends.
      store.markOutboxFailed(row.id, 'login required', null, 'suspended');
      suspended = true;
      logger.error?.('outbox suspended: login required');
      break;
    }

    if (result.recipientMismatch) {
      // Never retry a mismatch — fail hard so we cannot text the wrong person.
      store.markOutboxFailed(
        row.id,
        `recipient mismatch: wanted ${row.recipient_number} got ${result.selected || 'unknown'}`,
        null,
        'failed',
      );
      continue;
    }

    // Transient failure: schedule a backoff retry until we exhaust attempts.
    const attemptsSoFar = (row.attempts || 0) + 1;
    const error = result.error || 'send failed';
    if (attemptsSoFar >= maxRetries) {
      store.markOutboxFailed(row.id, error, null, 'failed');
    } else {
      const next = isoPlusSeconds(now(), backoffSeconds(row.attempts || 0));
      store.markOutboxFailed(row.id, error, next, 'queued');
    }
  }

  return { observation: false, sent, attempted, suspended };
}

export default { makeIdempotencyKey, enqueueOutbound, backoffSeconds, drainOutbox };
