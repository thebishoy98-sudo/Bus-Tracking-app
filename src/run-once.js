// One full automation cycle: ensure the browser session is healthy, poll the
// Google Voice inbox, process new messages (routing/booking/pricing), and drain
// the durable outbox. Sending stays disabled while in observation mode.
//
// Exported as runCycle() so the server and the CLI share one implementation.

import { pathToFileURL } from 'node:url';
import { store } from './db.js';
import { config as defaultConfig } from './config.js';
import { GoogleVoiceSession } from './google-voice/session.js';
import { browserReader, browserAttachmentFetcher, pollInbox } from './google-voice/inbox.js';
import { browserComposer, GoogleVoiceSender } from './google-voice/sender.js';
import { drainOutbox } from './google-voice/outbox.js';
import { processInbound } from './processor.js';

let sharedSession;
export function getSession() {
  if (!sharedSession) sharedSession = new GoogleVoiceSession({ store, config: defaultConfig });
  return sharedSession;
}

export async function runCycle({ session = getSession(), config = defaultConfig } = {}) {
  const state = await session.ensureReady();

  let polled = { loggedOut: state !== 'ready', added: 0, conversations: 0 };
  if (state === 'ready') {
    const reader = browserReader(session);
    const fetchAttachment = browserAttachmentFetcher(session);
    polled = await pollInbox({ reader, store, config, ownerNumber: config.ownerNumber, fetchAttachment });
    session.recordScan(true);
  } else {
    session.recordScan(false, 'login required');
  }

  // Process inbound regardless of browser state: it only touches the DB and the
  // outbox (no sending), and lets owner replies/bookings queue up.
  await processInbound({ store, config });

  // Drain the outbox (no-op while in observation mode).
  const sender = new GoogleVoiceSender({ driver: browserComposer(session) });
  const drained = await drainOutbox({ store, sender, config });

  return { state, polled, drained, outbox: store.getOutboxCounts() };
}

// CLI entry: run a single cycle and exit. (Guarded so importing this module for
// runCycle does not execute the cycle.)
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const session = getSession();
  runCycle({ session })
    .then(async (r) => {
      await session.close();
      console.log('Done.', JSON.stringify(r, null, 2));
      process.exit(0);
    })
    .catch(async (err) => {
      await session.close().catch(() => {});
      console.error('Cycle failed:', err);
      process.exit(1);
    });
}
