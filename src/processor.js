import { store } from './db.js';
import { fetchVoiceMessages, createCalendarEvent } from './google.js';
import { extractAppointment, extractWithClarification } from './claude.js';
import { textOwner } from './twilio.js';
import { config } from './config.js';
import { formatLocal } from './time.js';

const log = (...a) => console.log(new Date().toISOString(), ...a);
const safeJSON = (s) => { try { return JSON.parse(s); } catch { return null; } };

// 1) Pull new forwarded Voice texts into the DB (deduped by Gmail id).
export async function ingestNewMessages() {
  let added = 0;
  const messages = await fetchVoiceMessages();
  for (const m of messages) {
    if (store.hasMessage(m.gmailId)) continue;
    store.insertMessage({
      gmail_id: m.gmailId,
      from_number: m.from_number,
      from_name: m.from_name,
      body: m.body,
      received_at: m.received_at,
    });
    added++;
    log(`ingested message from ${m.from_name || m.from_number || 'unknown'}`);
  }
  return added;
}

function buildEvent(message, ex) {
  const who = ex.customer_name || message.from_name || message.from_number || 'Customer';
  const title = `${ex.service || 'Service'} — ${who}`;
  const description = [
    ex.service ? `Service: ${ex.service}` : null,
    ex.vehicle ? `Vehicle: ${ex.vehicle}` : null,
    ex.notes ? `Notes: ${ex.notes}` : null,
    message.from_number ? `Customer phone: ${message.from_number}` : null,
    `\nOriginal message:\n${message.body || ''}`,
  ].filter(Boolean).join('\n');
  return {
    title,
    description,
    start_local: ex.start_local,
    duration_minutes: ex.duration_minutes,
  };
}

async function book(message, ex, { confirmOwner } = {}) {
  const event = buildEvent(message, ex);
  const { id, link } = await createCalendarEvent(event);
  store.updateMessage(message.id, {
    status: 'scheduled',
    extracted: JSON.stringify(ex),
    calendar_event_id: id,
    calendar_link: link,
  });
  log(`booked "${event.title}" @ ${ex.start_local}`);
  if (confirmOwner) {
    await textOwner(`✅ Booked: ${event.title} — ${formatLocal(ex.start_local)}.`);
  }
  return link;
}

// 2) Work through pending messages: book the clear ones, ask about the unclear
//    ones (one outstanding question at a time so the owner's text thread stays clean).
export async function processPending() {
  const pending = store.getPending();
  for (const message of pending) {
    // Reuse a prior extraction if we already parsed this message (e.g. it was
    // waiting behind another open question). Saves repeat Claude calls.
    let ex = message.extracted ? safeJSON(message.extracted) : null;
    if (!ex) {
      try {
        ex = await extractAppointment(message);
        store.updateMessage(message.id, { extracted: JSON.stringify(ex) });
      } catch (err) {
        log('extract error:', err.message);
        store.updateMessage(message.id, { status: 'failed', error: err.message });
        continue;
      }
    }

    if (!ex.is_appointment_request) {
      store.updateMessage(message.id, { status: 'ignored', extracted: JSON.stringify(ex) });
      continue;
    }

    if (ex.has_enough_info && ex.start_local) {
      try {
        await book(message, ex); // silent: owner only hears from us when we're unsure
      } catch (err) {
        log('booking error:', err.message);
        store.updateMessage(message.id, { status: 'failed', error: err.message, extracted: JSON.stringify(ex) });
      }
      continue;
    }

    // Needs clarification. Only one open question at a time.
    if (store.hasOutstandingClarification()) {
      // Leave this one pending; we'll get to it once the current question is answered.
      continue;
    }

    const question = ex.clarification_question
      || `A customer (${message.from_name || message.from_number || 'unknown'}) wants to book but I couldn't pin down the date/time. What should I schedule?`;
    const who = message.from_name || message.from_number || 'a customer';
    const snippet = (message.body || '').replace(/\s+/g, ' ').slice(0, 140);
    try {
      await textOwner(`🔧 ${config.shopName}: need info on a booking from ${who}.\n"${snippet}"\n\n${question}\n\nReply with the details.`);
      store.updateMessage(message.id, {
        status: 'awaiting_clarification',
        extracted: JSON.stringify(ex),
        clarification_question: question,
        clarification_rounds: (message.clarification_rounds || 0) + 1,
      });
      log(`asked owner about message ${message.id}`);
    } catch (err) {
      log('twilio error:', err.message);
      store.updateMessage(message.id, { status: 'failed', error: err.message });
    }
  }
}

// 3) Handle the owner's SMS reply to a clarification question.
export async function handleOwnerReply(answerText) {
  const message = store.getOldestAwaiting();
  if (!message) {
    log('owner replied but nothing was awaiting clarification');
    return { matched: false };
  }
  store.updateMessage(message.id, { clarification_answer: answerText });

  let ex;
  try {
    ex = await extractWithClarification(message, message.clarification_question, answerText);
  } catch (err) {
    log('re-extract error:', err.message);
    store.updateMessage(message.id, { status: 'failed', error: err.message });
    await textOwner(`⚠️ Sorry, I had trouble processing that. Please book it manually.`);
    return { matched: true, booked: false };
  }

  if (ex.has_enough_info && ex.start_local) {
    try {
      await book(message, ex, { confirmOwner: true });
      return { matched: true, booked: true };
    } catch (err) {
      log('booking error after clarification:', err.message);
      store.updateMessage(message.id, { status: 'failed', error: err.message, extracted: JSON.stringify(ex) });
      await textOwner(`⚠️ Couldn't add that to the calendar (${err.message}). Please book it manually.`);
      return { matched: true, booked: false };
    }
  }

  // Still not enough info — ask once more, up to the configured limit.
  const rounds = (message.clarification_rounds || 0) + 1;
  if (rounds >= config.maxClarificationRounds) {
    store.updateMessage(message.id, { status: 'failed', extracted: JSON.stringify(ex), clarification_rounds: rounds, error: 'gave up after max clarification rounds' });
    await textOwner(`⚠️ Still couldn't pin that down. Please book it manually.`);
    return { matched: true, booked: false };
  }

  const followup = ex.clarification_question || 'Could you give me the exact date and time?';
  store.updateMessage(message.id, {
    extracted: JSON.stringify(ex),
    clarification_question: followup,
    clarification_rounds: rounds,
  });
  await textOwner(followup);
  return { matched: true, booked: false, askedAgain: true };
}

// Convenience: one full cycle.
export async function runPipeline() {
  const added = await ingestNewMessages();
  await processPending();
  return { added, counts: store.getCounts() };
}
