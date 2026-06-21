import { isOwnerNumber } from './google-voice/normalize.js';
import { parseApprovalCommand } from './approvals.js';
import { enqueueOutbound, makeIdempotencyKey } from './google-voice/outbox.js';

// Decide whether an inbound message is owner input or a customer message.
export function routeBySender(senderNumber, ownerNumber) {
  return isOwnerNumber(senderNumber, ownerNumber) ? 'owner' : 'customer';
}

function money(n) {
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

// Customer-facing estimate text. Deliberately, explicitly non-binding.
export function formatCustomerEstimate({ low, high, service }) {
  const svc = service ? ` for ${service}` : '';
  const range = low === high ? money(low) : `${money(low)}–${money(high)}`;
  return (
    `Thanks! Based on what you described, our estimate${svc} is ${range}. ` +
    `This is an estimate only, not a final or binding quote — the final price may ` +
    `change after we inspect the vehicle in person.`
  );
}

// Queue a private note back to the owner (never to a customer).
export function enqueueOwnerNote(store, config, body, tag = '') {
  const key = makeIdempotencyKey({ recipient: config.ownerNumber, kind: 'text', body, tag });
  return enqueueOutbound(store, { recipient: config.ownerNumber, body, idempotencyKey: key });
}

// Interpret an owner reply in the context of the single pending approval.
// Returns a small result describing what happened. Safe to replay: once the
// action is resolved, a repeated APPROVE finds nothing pending and no-ops.
export function handleOwnerReply({ store, config, text }) {
  const pending = store.getPendingOwnerAction('pricing_approval');

  if (!pending) {
    enqueueOwnerNote(
      store, config,
      "I don't have a price approval waiting right now, so I didn't send anything.",
      'no-pending',
    );
    return { matched: false };
  }

  const cmd = parseApprovalCommand(text);

  if (cmd.type === 'unknown') {
    enqueueOwnerNote(
      store, config,
      'I need a clear instruction: reply APPROVE, EDIT <amount or range>, or NOQUOTE.',
      `clarify:${pending.id}`,
    );
    return { matched: true, ambiguous: true };
  }

  if (cmd.type === 'noquote') {
    store.resolveOwnerAction(pending.id, 'noquote');
    return { matched: true, action: 'noquote' };
  }

  // approve | edit → release a non-binding estimate to the customer.
  const payload = safeJson(pending.payload) || {};
  const low = cmd.type === 'edit' ? cmd.low : payload.low;
  const high = cmd.type === 'edit' ? cmd.high : payload.high;
  const conv = store.getConversationById(pending.conversation_id);

  if (!conv || (low == null && high == null)) {
    enqueueOwnerNote(store, config, "I couldn't find the customer or price to send. Please handle manually.", `err:${pending.id}`);
    store.resolveOwnerAction(pending.id, 'error');
    return { matched: true, action: cmd.type, error: true };
  }

  const body = formatCustomerEstimate({ low, high, service: payload.service });
  const key = makeIdempotencyKey({ recipient: conv.phone_number, kind: 'text', body, tag: `estimate:${pending.id}` });
  enqueueOutbound(store, { recipient: conv.phone_number, body, idempotencyKey: key });
  store.resolveOwnerAction(pending.id, cmd.type === 'approve' ? 'approved' : 'edited');

  return { matched: true, action: cmd.type, low, high };
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

export default { routeBySender, handleOwnerReply, enqueueOwnerNote, formatCustomerEstimate };
