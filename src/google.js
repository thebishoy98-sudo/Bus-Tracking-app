import fs from 'fs';
import { google } from 'googleapis';
import { config } from './config.js';
import { addMinutesLocal } from './time.js';

// ── OAuth ────────────────────────────────────────────────────
// Scopes: read Gmail (to see forwarded Voice texts) + manage Calendar events.
export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

export function makeOAuthClient() {
  return new google.auth.OAuth2(
    config.googleClientId(),
    config.googleClientSecret(),
    config.googleRedirectUri,
  );
}

// Builds an authorized client from the token saved by `npm run auth`.
export function getAuthorizedClient() {
  // Two ways to supply the token:
  //   1. GOOGLE_TOKEN_JSON env var  -> for headless hosts (Render, etc.)
  //   2. a token file on disk       -> created locally by `npm run auth`
  let token;
  let fromEnv = false;
  if (config.googleTokenJson) {
    try {
      token = JSON.parse(config.googleTokenJson);
      fromEnv = true;
    } catch {
      throw new Error('GOOGLE_TOKEN_JSON is set but is not valid JSON. Paste the full contents of google-token.json.');
    }
  } else if (fs.existsSync(config.tokenPath)) {
    token = JSON.parse(fs.readFileSync(config.tokenPath, 'utf8'));
  } else {
    throw new Error(
      `No Google token found. Run "npm run auth" locally, then either keep ${config.tokenPath} ` +
      `or set GOOGLE_TOKEN_JSON to its contents (see README "Deploy to Render").`
    );
  }

  const client = makeOAuthClient();
  client.setCredentials(token);
  // When loaded from a file, persist refreshed access tokens back to disk.
  // When loaded from env, we can't write back, but that's fine: the long-lived
  // refresh_token in the env value lets the client mint new access tokens.
  if (!fromEnv) {
    client.on('tokens', (t) => {
      const merged = { ...token, ...t };
      fs.writeFileSync(config.tokenPath, JSON.stringify(merged, null, 2));
    });
  }
  return client;
}

// ── Gmail: fetch forwarded Google Voice texts ────────────────
function decodeBody(payload) {
  // Walk the MIME tree and prefer text/plain, falling back to stripped HTML.
  let plain = '';
  let html = '';
  const walk = (part) => {
    if (!part) return;
    const data = part.body?.data;
    if (data) {
      const text = Buffer.from(data, 'base64').toString('utf8');
      if (part.mimeType === 'text/plain') plain += text;
      else if (part.mimeType === 'text/html') html += text;
    }
    (part.parts || []).forEach(walk);
  };
  walk(payload);
  if (plain.trim()) return plain;
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+\n/g, '\n');
}

function headerValue(headers, name) {
  const h = (headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

function extractPhone(text) {
  const m = (text || '').match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  return m ? m[0].trim() : null;
}

// Returns [{ gmailId, from_name, from_number, body, received_at }]
export async function fetchVoiceMessages() {
  const gmail = google.gmail({ version: 'v1', auth: getAuthorizedClient() });
  const list = await gmail.users.messages.list({
    userId: 'me',
    q: config.gmailQuery,
    maxResults: 25,
  });

  const results = [];
  for (const { id } of list.data.messages || []) {
    const full = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
    const headers = full.data.payload?.headers;
    const subject = headerValue(headers, 'Subject');
    const from = headerValue(headers, 'From'); // e.g. "John Doe" <...@txt.voice.google.com>
    const dateHeader = headerValue(headers, 'Date');
    const rawBody = decodeBody(full.data.payload || {});

    // The forwarding email usually names the sender in the subject ("New text
    // message from John Doe") and repeats the number in the body. We keep our
    // own best guess but mostly rely on Claude to read the messy body.
    const nameMatch = subject.match(/from\s+(.+)$/i) || from.match(/"?([^"<]+)"?\s*</);
    const fromName = (nameMatch ? nameMatch[1] : from).trim().replace(/\s+/g, ' ') || null;
    const fromNumber = extractPhone(from) || extractPhone(rawBody);

    results.push({
      gmailId: id,
      from_name: fromName,
      from_number: fromNumber,
      body: cleanVoiceBody(rawBody),
      received_at: dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString(),
    });
  }
  return results;
}

// Trim the Google Voice email footer so Claude sees mostly the real message.
function cleanVoiceBody(body) {
  if (!body) return '';
  const cutMarkers = [
    'To respond to this text message',
    'YOUR ACCOUNT',
    'This email was sent to you because',
    'https://voice.google.com',
  ];
  let out = body;
  for (const marker of cutMarkers) {
    const idx = out.indexOf(marker);
    if (idx > 0) out = out.slice(0, idx);
  }
  return out.trim();
}

// ── Calendar: create the appointment ─────────────────────────
// appt: { title, description, start_local ("YYYY-MM-DDTHH:MM:SS"), duration_minutes }
export async function createCalendarEvent(appt) {
  const calendar = google.calendar({ version: 'v3', auth: getAuthorizedClient() });
  const minutes = appt.duration_minutes || config.defaultMinutes;
  const end = addMinutesLocal(appt.start_local, minutes);

  const res = await calendar.events.insert({
    calendarId: config.calendarId,
    requestBody: {
      summary: appt.title,
      description: appt.description,
      start: { dateTime: appt.start_local, timeZone: config.timezone },
      end: { dateTime: end, timeZone: config.timezone },
    },
  });
  return { id: res.data.id, link: res.data.htmlLink };
}
