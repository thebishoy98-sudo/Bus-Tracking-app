import fs from 'fs';
import { google } from 'googleapis';
import { config } from './config.js';
import { addMinutesLocal } from './time.js';

// ── OAuth ────────────────────────────────────────────────────
// Calendar + Contacts only. Messaging is handled by the Google Voice browser
// adapter, so we no longer request any mail scope.
export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/contacts',
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
      `or set GOOGLE_TOKEN_JSON to its contents (see README "Deploy to Render").`,
    );
  }

  const client = makeOAuthClient();
  client.setCredentials(token);
  if (!fromEnv) {
    client.on('tokens', (t) => {
      const merged = { ...token, ...t };
      fs.writeFileSync(config.tokenPath, JSON.stringify(merged, null, 2));
    });
  }
  return client;
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
