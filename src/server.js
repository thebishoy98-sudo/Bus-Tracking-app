import express from 'express';
import cron from 'node-cron';
import { config } from './config.js';
import { store } from './db.js';
import { runCycle } from './run-once.js';
import { renderDashboard, validatePriceEntry } from './dashboard.js';
import { requireAuth } from './auth.js';
import { resolveMediaPath } from './media.js';
import { runRetention } from './retention.js';

const app = express();
app.use(express.urlencoded({ extended: false }));

const log = (...a) => console.log(new Date().toISOString(), ...a);

// Effective observation mode = runtime override (dashboard) else config default.
function effectiveObservation() {
  const o = store.getHealth('observation_mode');
  if (o === 'off') return false;
  if (o === 'on') return true;
  return config.observationMode;
}
function effectiveConfig() {
  return { ...config, observationMode: effectiveObservation() };
}

let running = false;
async function safeCycle(reason) {
  if (running) { log(`skip ${reason}: a cycle is already running`); return; }
  running = true;
  try {
    const r = await runCycle({ config: effectiveConfig() });
    if (r.polled?.added) log(`cycle added ${r.polled.added} message(s); outbox`, r.outbox);
  } catch (err) {
    log('cycle error:', err.message);
  } finally {
    running = false;
  }
}

// ── Health check is public; everything else requires authentication. ──
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use(requireAuth(config));

// ── Dashboard ──
function dashboardData() {
  return {
    shopName: config.shopName,
    timezone: config.timezone,
    observation: effectiveObservation(),
    health: store.healthSnapshot(),
    pendingApprovals: store.getAllPendingOwnerActions(),
    failedSends: store.getFailedOutbox(),
    messages: store.getRecentInbound(40),
    priceBook: store.getAllPriceEntries(),
  };
}

app.get('/', (req, res) => res.send(renderDashboard(dashboardData())));

app.get('/api/data', (req, res) => res.json({
  observation: effectiveObservation(),
  health: store.healthSnapshot(),
  outbox: store.getOutboxCounts(),
  pendingApprovals: store.getAllPendingOwnerActions().length,
}));

// Protected media: serve only files that resolve inside the media directory.
app.get('/media/:file', (req, res) => {
  let abs;
  try {
    abs = resolveMediaPath(config, req.params.file);
  } catch {
    return res.status(400).send('invalid path');
  }
  res.sendFile(abs, (err) => { if (err) res.status(404).end(); });
});

// Manual scan.
app.post('/run', (req, res) => {
  safeCycle('manual run').catch((err) => log('manual run error:', err.message));
  res.redirect('/');
});

// Toggle observation mode (off = sending enabled).
app.post('/observation', (req, res) => {
  store.setHealth('observation_mode', req.body.mode === 'off' ? 'off' : 'on');
  log(`observation mode set to ${effectiveObservation() ? 'ON' : 'OFF'}`);
  res.redirect('/');
});

// Price-book CRUD.
app.post('/price', (req, res) => {
  const { ok, value, errors } = validatePriceEntry(req.body);
  if (!ok) return res.status(400).send('Invalid price entry: ' + errors.join('; '));
  store.insertPriceEntry(value);
  res.redirect('/');
});
app.post('/price/:id/delete', (req, res) => {
  store.deletePriceEntry(Number(req.params.id));
  res.redirect('/');
});

// Retry a failed/suspended outbound send.
app.post('/outbox/:id/retry', (req, res) => {
  store.requeueOutbox(Number(req.params.id));
  res.redirect('/');
});

// Manual retention sweep.
app.post('/retention', (req, res) => {
  try { runRetention({ store, config }); } catch (err) { log('retention error:', err.message); }
  res.redirect('/');
});

// ── Start server + schedule the recurring cycle ──
app.listen(config.port, () => {
  log(`${config.shopName} appointment bot listening on http://localhost:${config.port}`);
  log(`observation mode: ${effectiveObservation() ? 'ON (not sending)' : 'OFF (sending enabled)'}`);
  log(`scanning Google Voice on schedule "${config.cronSchedule}" (timezone ${config.timezone})`);
});

cron.schedule(config.cronSchedule, () => { safeCycle('scheduled scan'); }, { timezone: config.timezone });

// Retention runs on its own daily schedule, independent of message polling.
cron.schedule('17 3 * * *', () => {
  try {
    const r = runRetention({ store, config });
    log('retention:', r.summary);
  } catch (err) {
    log('retention error:', err.message);
  }
}, { timezone: config.timezone });

setTimeout(() => { safeCycle('startup scan'); }, 3000);
