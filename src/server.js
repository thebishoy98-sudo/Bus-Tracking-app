import express from 'express';
import cron from 'node-cron';
import { config } from './config.js';
import { store } from './db.js';
import { runCycle } from './run-once.js';
import { renderDashboard } from './dashboard.js';

const app = express();
app.use(express.urlencoded({ extended: false }));

const log = (...a) => console.log(new Date().toISOString(), ...a);

let running = false;
async function safeCycle(reason) {
  if (running) { log(`skip ${reason}: a cycle is already running`); return; }
  running = true;
  try {
    const r = await runCycle();
    if (r.polled?.added) log(`cycle added ${r.polled.added} message(s); outbox`, r.outbox);
  } catch (err) {
    log('cycle error:', err.message);
  } finally {
    running = false;
  }
}

// ── Dashboard ──
app.get('/', (req, res) => {
  res.send(renderDashboard(store.getCounts(), store.getRecent(60)));
});

app.get('/api/data', (req, res) => {
  res.json({ counts: store.getCounts(), health: store.healthSnapshot(), outbox: store.getOutboxCounts() });
});

// Manual "Scan now" trigger from the dashboard.
app.post('/run', async (req, res) => {
  safeCycle('manual run').catch((err) => log('manual run error:', err.message));
  res.redirect('/');
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

// ── Start server + schedule the recurring cycle ──
app.listen(config.port, () => {
  log(`${config.shopName} appointment bot listening on http://localhost:${config.port}`);
  log(`observation mode: ${config.observationMode ? 'ON (not sending)' : 'OFF (sending enabled)'}`);
  log(`scanning Google Voice on schedule "${config.cronSchedule}" (timezone ${config.timezone})`);
});

cron.schedule(
  config.cronSchedule,
  () => { safeCycle('scheduled scan'); },
  { timezone: config.timezone },
);

// Run one cycle shortly after boot so we don't wait for the first interval.
setTimeout(() => { safeCycle('startup scan'); }, 3000);
