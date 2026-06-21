import express from 'express';
import cron from 'node-cron';
import { config } from './config.js';
import { store } from './db.js';
import { runPipeline, handleOwnerReply } from './processor.js';
import { sameNumber, validateRequest } from './twilio.js';
import { renderDashboard } from './dashboard.js';

const app = express();
app.use(express.urlencoded({ extended: false }));

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ── Twilio inbound SMS webhook (the owner's clarification replies) ──
app.post('/sms/incoming', (req, res) => {
  // Optional: verify the request really came from Twilio.
  if (config.publicUrl) {
    const signature = req.header('X-Twilio-Signature');
    const url = `${config.publicUrl.replace(/\/$/, '')}/sms/incoming`;
    const valid = validateRequest(config.twilioToken(), signature, url, req.body);
    if (!valid) {
      log('rejected webhook with invalid Twilio signature');
      return res.status(403).send('invalid signature');
    }
  }

  const from = req.body.From;
  const body = (req.body.Body || '').trim();

  // Always answer Twilio quickly with empty TwiML; do the work in the background.
  res.set('Content-Type', 'text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

  if (!sameNumber(from, config.ownerPhone())) {
    log(`ignoring SMS from non-owner number ${from}`);
    return;
  }
  handleOwnerReply(body).catch((err) => log('handleOwnerReply error:', err.message));
});

// ── Dashboard ──
app.get('/', (req, res) => {
  res.send(renderDashboard(store.getCounts(), store.getRecent(60)));
});

app.get('/api/data', (req, res) => {
  res.json({ counts: store.getCounts(), messages: store.getRecent(60) });
});

// Manual "Scan now" trigger from the dashboard.
app.post('/run', async (req, res) => {
  try {
    await runPipeline();
  } catch (err) {
    log('manual run error:', err.message);
  }
  res.redirect('/');
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

// ── Start server + schedule the recurring scan ──
app.listen(config.port, () => {
  log(`${config.shopName} appointment bot listening on http://localhost:${config.port}`);
  log(`scanning Google Voice on schedule "${config.cronSchedule}" (timezone ${config.timezone})`);
});

cron.schedule(
  config.cronSchedule,
  async () => {
    log('scan starting');
    try {
      const r = await runPipeline();
      if (r.added) log(`scan added ${r.added} new message(s)`);
    } catch (err) {
      log('scan error:', err.message);
    }
  },
  { timezone: config.timezone }
);

// Run one scan shortly after boot so you don't wait for the first interval.
setTimeout(() => {
  runPipeline().catch((err) => log('startup scan error:', err.message));
}, 3000);
