import { parse } from 'node-html-parser';
import { THREADS, MESSAGES, AUTH, URLS } from './selectors.js';
import { normalizeMessage, normalizePhone, isOwnerNumber } from './normalize.js';
import { validateAttachment, storeAttachment } from '../media.js';

// ── Pure DOM parsing (testable against HTML fixtures) ────────

// Union of comma-separated selectors (node-html-parser handles groups
// inconsistently, so we split and merge ourselves, de-duplicating nodes).
function selectAll(root, selectorGroup) {
  const seen = new Set();
  const out = [];
  for (const sel of selectorGroup.split(',').map((s) => s.trim()).filter(Boolean)) {
    for (const el of root.querySelectorAll(sel)) {
      if (!seen.has(el)) { seen.add(el); out.push(el); }
    }
  }
  return out;
}

function firstText(el, selectorGroup) {
  for (const sel of selectorGroup.split(',').map((s) => s.trim()).filter(Boolean)) {
    const found = el.querySelector(sel);
    if (found) return found.text.trim();
  }
  return '';
}

export function looksLoggedOut(html) {
  const root = parse(html);
  for (const sel of [...AUTH.challengeIndicators, ...AUTH.loginIndicators]) {
    if (root.querySelector(sel)) return true;
  }
  return false;
}

export function parseConversationList(html) {
  const root = parse(html);
  return selectAll(root, THREADS.item).map((el) => ({
    conversationId: el.getAttribute('data-thread-id') || null,
    phoneNumber: el.getAttribute('data-phone')
      || el.querySelector('.gv-thread-number')?.text?.trim()
      || null,
    displayName: el.querySelector('.gv-thread-name')?.text?.trim() || null,
    lastMessageAt: el.querySelector('time')?.getAttribute('datetime') || null,
    unread: el.classList?.contains('unread') || !!el.querySelector(THREADS.unread),
    snippet: el.querySelector('.gv-thread-snippet')?.text?.trim() || null,
  }));
}

export function parseThread(html, { conversationId = null } = {}) {
  const root = parse(html);
  const convId = conversationId
    || root.querySelector(MESSAGES.container)?.getAttribute('data-thread-id')
    || root.querySelector('[data-thread-id]')?.getAttribute('data-thread-id')
    || null;

  return selectAll(root, MESSAGES.bubble).map((el) => {
    const outAttr = el.getAttribute('data-is-outgoing');
    const isOutgoing = outAttr === 'true' || el.classList?.contains('outgoing');
    const attachments = selectAll(el, MESSAGES.attachmentImage).map((img) => ({
      url: img.getAttribute('src') || null,
      mime: img.getAttribute('data-mime') || null,
      name: img.getAttribute('data-name') || null,
      byteSize: img.getAttribute('data-size') ? parseInt(img.getAttribute('data-size'), 10) : null,
    }));
    return {
      conversationId: convId,
      senderNumber: el.getAttribute('data-sender') || null,
      senderName: el.querySelector('.gv-message-sender')?.text?.trim() || null,
      isOutgoing: !!isOutgoing,
      timestamp: el.querySelector('time')?.getAttribute('datetime') || null,
      text: firstText(el, MESSAGES.text),
      attachments,
    };
  });
}

// ── Orchestration ───────────────────────────────────────────

async function ingestAttachment({ att, messageId, index, store, config, fetchAttachment, logger }) {
  let buffer;
  try {
    buffer = await fetchAttachment(att.url);
  } catch (err) {
    store.insertAttachment({
      message_id: messageId, kind: 'image', mime: att.mime, byte_size: null,
      file_path: null, sha256: null, status: 'rejected',
      reject_reason: `download failed: ${err.message}`,
    });
    return;
  }

  const byteSize = buffer.length;
  const v = validateAttachment({ mime: att.mime, byteSize }, config);
  if (!v.ok) {
    store.insertAttachment({
      message_id: messageId, kind: 'image', mime: att.mime, byte_size: byteSize,
      file_path: null, sha256: null, status: 'rejected', reject_reason: v.reason,
    });
    return;
  }

  try {
    const stored = await storeAttachment({ buffer, mime: att.mime, ext: att.ext, messageId, index }, config);
    store.insertAttachment({
      message_id: messageId, kind: 'image', mime: att.mime, byte_size: stored.byteSize,
      file_path: stored.filePath, sha256: stored.sha256, status: 'stored', reject_reason: null,
    });
  } catch (err) {
    logger.error?.('store attachment failed:', err.message);
    store.insertAttachment({
      message_id: messageId, kind: 'image', mime: att.mime, byte_size: byteSize,
      file_path: null, sha256: null, status: 'rejected', reject_reason: err.message,
    });
  }
}

// Poll the inbox via an injected `reader` (browser-backed in production,
// fixture-backed in tests). Ingests new inbound messages with deterministic
// deduplication and downloads/validates image attachments.
export async function pollInbox({
  reader, store, config, ownerNumber, fetchAttachment,
  maxConversations = 25, logger = console,
}) {
  const listHtml = await reader.listConversationsHtml();
  if (looksLoggedOut(listHtml)) return { loggedOut: true, added: 0, conversations: 0 };

  const convs = parseConversationList(listHtml).slice(0, maxConversations);
  let added = 0;

  for (const conv of convs) {
    const phone = normalizePhone(conv.phoneNumber);
    const isOwner = isOwnerNumber(conv.phoneNumber, ownerNumber) ? 1 : 0;
    const convId = store.upsertConversation({
      gv_conversation_id: conv.conversationId,
      phone_number: phone,
      display_name: conv.displayName,
      is_owner: isOwner,
    });
    if (conv.lastMessageAt) store.touchConversation(convId, conv.lastMessageAt);

    const threadHtml = await reader.openConversationHtml(conv.conversationId);
    const raws = parseThread(threadHtml, { conversationId: conv.conversationId });

    for (const raw of raws) {
      const msg = normalizeMessage(
        { ...raw, senderNumber: raw.senderNumber || conv.phoneNumber },
        ownerNumber,
      );
      if (msg.direction !== 'inbound') continue; // never re-ingest our own sends
      if (store.hasFingerprint(msg.fingerprint)) continue;

      const res = store.insertInboundMessage({
        conversation_id: convId,
        fingerprint: msg.fingerprint,
        direction: msg.direction,
        sender_number: msg.senderNumber || phone,
        body: msg.body,
        sent_at: msg.timestamp,
        has_attachments: msg.hasAttachments ? 1 : 0,
      });
      if (!res.inserted) continue;
      added++;

      if (msg.hasAttachments && fetchAttachment) {
        const images = msg.attachments
          .filter((a) => a.kind === 'image')
          .slice(0, config.maxImagesPerMessage);
        let index = 0;
        for (const att of images) {
          // eslint-disable-next-line no-await-in-loop -- sequential, bounded download
          await ingestAttachment({ att, messageId: res.id, index: index++, store, config, fetchAttachment, logger });
        }
      }
    }
  }

  return { loggedOut: false, added, conversations: convs.length };
}

// Build a reader backed by a live GoogleVoiceSession. Selectors/navigation here
// are best-effort and verified during the live smoke test (Task 14).
export function browserReader(session) {
  return {
    async listConversationsHtml() {
      return session.withPage(async (page) => {
        await page.goto(URLS.messages);
        return page.content();
      });
    },
    async openConversationHtml(conversationId) {
      return session.withPage(async (page) => {
        await page.goto(`${URLS.messages}/${encodeURIComponent(conversationId)}`);
        return page.content();
      });
    },
  };
}

// Download an attachment through the authenticated browser context.
export function browserAttachmentFetcher(session) {
  return async (url) => session.withPage(async (page) => {
    const resp = await page.request.get(url);
    const buf = await resp.body();
    return Buffer.from(buf);
  });
}

export default { pollInbox, parseConversationList, parseThread, looksLoggedOut, browserReader, browserAttachmentFetcher };
