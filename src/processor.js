import { store as defaultStore } from './db.js';
import { config as defaultConfig } from './config.js';
import { createCalendarEvent } from './google.js';
import { extractAppointment, extractWithClarification } from './claude.js';
import { routeBySender, handleOwnerReply, enqueueOwnerNote } from './router.js';
import { enqueueOutbound, makeIdempotencyKey } from './google-voice/outbox.js';
import { formatLocal } from './time.js';

const log = (...a) => console.log(new Date().toISOString(), ...a);
const safeJSON = (s) => { try { return JSON.parse(s); } catch { return null; } };

function buildEvent(message, conv, ex) {
  const who = ex.customer_name || conv?.display_name || message.sender_number || 'Customer';
  const title = `${ex.service || 'Service'} — ${who}`;
  const description = [
    ex.service ? `Service: ${ex.service}` : null,
    ex.vehicle ? `Vehicle: ${ex.vehicle}` : null,
    ex.notes ? `Notes: ${ex.notes}` : null,
    message.sender_number ? `Customer phone: ${message.sender_number}` : null,
    `\nOriginal message:\n${message.body || ''}`,
  ].filter(Boolean).join('\n');
  return { title, description, start_local: ex.start_local, duration_minutes: ex.duration_minutes };
}

// Queue a customer-facing message to the conversation it originated from.
function enqueueCustomerMessage(store, conv, body, tag) {
  const key = makeIdempotencyKey({ recipient: conv.phone_number, kind: 'text', body, tag });
  return enqueueOutbound(store, { recipient: conv.phone_number, body, idempotencyKey: key });
}

// Validated, retained image files attached to a message, for Claude vision.
function storedImagesFor(store, messageId) {
  return store.getAttachmentsForMessage(messageId)
    .filter((a) => a.status === 'stored' && a.kind === 'image' && a.file_path)
    .map((a) => ({ filePath: a.file_path, mime: a.mime }));
}

async function processCustomerMessage(m, { store, config }) {
  const conv = store.getConversationById(m.conversation_id);
  const images = storedImagesFor(store, m.id);
  let ex = m.extracted ? safeJSON(m.extracted) : null;
  if (!ex) {
    try {
      ex = await extractAppointment(
        { from_name: conv?.display_name, from_number: m.sender_number, body: m.body },
        { images, config },
      );
      store.updateInboundMessage(m.id, { extracted: JSON.stringify(ex) });
    } catch (err) {
      log('extract error:', err.message);
      store.updateInboundMessage(m.id, { status: 'failed', error: err.message });
      return;
    }
  }

  if (!ex.is_appointment_request) {
    store.updateInboundMessage(m.id, { status: 'ignored', extracted: JSON.stringify(ex) });
    return;
  }

  if (ex.has_enough_info && ex.start_local) {
    try {
      const event = buildEvent(m, conv, ex);
      const { link } = await createCalendarEvent(event);
      store.updateInboundMessage(m.id, { status: 'scheduled', extracted: JSON.stringify(ex) });
      enqueueCustomerMessage(
        store, conv,
        `You're booked: ${event.title} — ${formatLocal(ex.start_local)}. Reply here if you need to change it.`,
        `confirm:${m.id}`,
      );
      log(`booked "${event.title}" @ ${ex.start_local}`);
    } catch (err) {
      log('booking error:', err.message);
      store.updateInboundMessage(m.id, { status: 'failed', error: err.message, extracted: JSON.stringify(ex) });
    }
    return;
  }

  // Needs clarification — ask the owner privately, one outstanding question at a time.
  if (store.getPendingOwnerAction('clarification')) {
    return; // leave this message 'new'; handle once the current question is answered
  }
  const who = conv?.display_name || m.sender_number || 'a customer';
  const snippet = (m.body || '').replace(/\s+/g, ' ').slice(0, 140);
  const question = ex.clarification_question
    || `A customer (${who}) wants to book but I couldn't pin down the date/time. What should I schedule?`;
  store.createOwnerAction({
    kind: 'clarification', conversation_id: m.conversation_id, customer_message_id: m.id,
    payload: JSON.stringify({ question }),
  });
  store.updateInboundMessage(m.id, { status: 'awaiting_owner', extracted: JSON.stringify(ex) });
  enqueueOwnerNote(
    store, config,
    `${config.shopName || 'Shop'}: need info on a booking from ${who}.\n"${snippet}"\n\n${question}\n\nReply with the details.`,
    `clar:${m.id}`,
  );
}

async function handleClarificationAnswer(action, answerText, { store, config }) {
  const m = action.customer_message_id ? store.getInboundById(action.customer_message_id) : null;
  const conv = m ? store.getConversationById(m.conversation_id) : null;
  if (!m || !conv) {
    store.resolveOwnerAction(action.id, 'error');
    return { matched: true, booked: false };
  }
  const payload = safeJSON(action.payload) || {};
  let ex;
  try {
    ex = await extractWithClarification(
      { from_name: conv.display_name, from_number: m.sender_number, body: m.body },
      payload.question, answerText,
    );
  } catch (err) {
    store.updateInboundMessage(m.id, { status: 'failed', error: err.message });
    store.resolveOwnerAction(action.id, 'error');
    enqueueOwnerNote(store, config, 'Sorry, I had trouble processing that. Please book it manually.', `clarerr:${m.id}`);
    return { matched: true, booked: false };
  }

  if (ex.has_enough_info && ex.start_local) {
    try {
      const event = buildEvent(m, conv, ex);
      await createCalendarEvent(event);
      store.updateInboundMessage(m.id, { status: 'scheduled', extracted: JSON.stringify(ex) });
      store.resolveOwnerAction(action.id, 'resolved');
      enqueueCustomerMessage(store, conv,
        `You're booked: ${event.title} — ${formatLocal(ex.start_local)}.`, `confirm:${m.id}`);
      enqueueOwnerNote(store, config, `Booked: ${event.title} — ${formatLocal(ex.start_local)}.`, `booked:${m.id}`);
      return { matched: true, booked: true };
    } catch (err) {
      store.updateInboundMessage(m.id, { status: 'failed', error: err.message, extracted: JSON.stringify(ex) });
      store.resolveOwnerAction(action.id, 'error');
      enqueueOwnerNote(store, config, `Couldn't add that to the calendar (${err.message}). Please book it manually.`, `calerr:${m.id}`);
      return { matched: true, booked: false };
    }
  }

  // Still not enough — keep the action open and ask once more.
  const followup = ex.clarification_question || 'Could you give me the exact date and time?';
  store.updateInboundMessage(m.id, { extracted: JSON.stringify(ex) });
  enqueueOwnerNote(store, config, followup, `clar2:${m.id}`);
  return { matched: true, booked: false, askedAgain: true };
}

function handleOwnerInbound(m, deps) {
  const { store, config } = deps;
  const pricing = store.getPendingOwnerAction('pricing_approval');
  if (pricing) return handleOwnerReply({ store, config, text: m.body });
  const clar = store.getPendingOwnerAction('clarification');
  if (clar) return handleClarificationAnswer(clar, m.body, deps);
  return handleOwnerReply({ store, config, text: m.body });
}

// Process all newly ingested inbound messages: route owner vs customer.
export async function processInbound({ store = defaultStore, config = defaultConfig } = {}) {
  const deps = { store, config };
  for (const m of store.getNewInbound()) {
    try {
      if (routeBySender(m.sender_number, config.ownerNumber) === 'owner') {
        await handleOwnerInbound(m, deps);
        store.updateInboundMessage(m.id, { status: 'processed' });
      } else {
        await processCustomerMessage(m, deps);
      }
    } catch (err) {
      log('process error:', err.message);
      store.updateInboundMessage(m.id, { status: 'failed', error: err.message });
    }
  }
}

export { processCustomerMessage, handleOwnerInbound };
