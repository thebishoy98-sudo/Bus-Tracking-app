import dotenv from 'dotenv';
dotenv.config();

function req(name, fallback = undefined) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Copy .env.example to .env and fill it in (see README.md).`
    );
  }
  return v;
}

function opt(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

export const config = {
  // Claude
  anthropicApiKey: () => req('ANTHROPIC_API_KEY'),
  anthropicModel: opt('ANTHROPIC_MODEL', 'claude-sonnet-4-6'),

  // Google
  googleClientId: () => req('GOOGLE_CLIENT_ID'),
  googleClientSecret: () => req('GOOGLE_CLIENT_SECRET'),
  googleRedirectUri: opt('GOOGLE_REDIRECT_URI', 'http://localhost:5555'),
  // Optional: full contents of google-token.json, for headless hosts.
  googleTokenJson: opt('GOOGLE_TOKEN_JSON', ''),
  gmailQuery: opt('GMAIL_QUERY', 'from:txt.voice.google.com newer_than:2d'),
  calendarId: opt('GOOGLE_CALENDAR_ID', 'primary'),

  // Twilio
  twilioSid: () => req('TWILIO_ACCOUNT_SID'),
  twilioToken: () => req('TWILIO_AUTH_TOKEN'),
  twilioFrom: () => req('TWILIO_FROM_NUMBER'),
  ownerPhone: () => req('OWNER_PHONE_NUMBER'),

  // Shop
  shopName: opt('SHOP_NAME', 'the shop'),
  timezone: opt('SHOP_TIMEZONE', 'America/New_York'),
  defaultMinutes: parseInt(opt('DEFAULT_APPOINTMENT_MINUTES', '60'), 10),
  cronSchedule: opt('CRON_SCHEDULE', '*/5 * * * *'),
  maxClarificationRounds: parseInt(opt('MAX_CLARIFICATION_ROUNDS', '3'), 10),

  // App
  port: parseInt(opt('PORT', '3000'), 10),
  dbPath: opt('DB_PATH', './data.db'),
  tokenPath: opt('TOKEN_PATH', './google-token.json'),
  publicUrl: opt('PUBLIC_URL', ''),
};
