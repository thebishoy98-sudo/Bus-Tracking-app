import dotenv from 'dotenv';
dotenv.config();

// Reduce any phone-number representation to its 10 significant digits so the
// owner line can be compared regardless of formatting or a leading country code.
export function normalizeOwnerNumber(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length === 10) return digits;
  return '';
}

function reqFrom(env, name) {
  const v = env[name];
  if (v === undefined || v === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Copy .env.example to .env and fill it in (see README.md).`,
    );
  }
  return v;
}

function optFrom(env, name, fallback) {
  const v = env[name];
  return v === undefined || v === '' ? fallback : v;
}

// "true" unless the value is an explicit falsey token. Defaults stay safe (on)
// because observation mode must err on the side of never sending.
function parseBool(v, fallback) {
  if (v === undefined || v === '') return fallback;
  return !['false', '0', 'no', 'off'].includes(String(v).trim().toLowerCase());
}

function intFrom(env, name, fallback) {
  const v = env[name];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

// Build the configuration from an arbitrary env object so it can be exercised
// deterministically in tests. The default export reads process.env at import.
export function buildConfig(env = process.env) {
  const opt = (name, fallback) => optFrom(env, name, fallback);
  const req = (name, fallback) => () => reqFrom(env, name) ?? fallback;

  return {
    // Claude
    anthropicApiKey: req('ANTHROPIC_API_KEY'),
    anthropicModel: opt('ANTHROPIC_MODEL', 'claude-sonnet-4-6'),

    // Google (Calendar only; Gmail/Twilio are removed in later tasks)
    googleClientId: req('GOOGLE_CLIENT_ID'),
    googleClientSecret: req('GOOGLE_CLIENT_SECRET'),
    googleRedirectUri: opt('GOOGLE_REDIRECT_URI', 'http://localhost:5555'),
    googleTokenJson: opt('GOOGLE_TOKEN_JSON', ''),
    gmailQuery: opt('GMAIL_QUERY', 'from:txt.voice.google.com newer_than:2d'),
    calendarId: opt('GOOGLE_CALENDAR_ID', 'primary'),

    // Owner / messaging
    ownerNumber: normalizeOwnerNumber(opt('OWNER_PHONE_NUMBER', '7328228376')),

    // Google Voice browser automation
    browserProfilePath: opt('GV_PROFILE_PATH', './.gv-profile'),
    mediaPath: opt('MEDIA_PATH', './media'),
    diagnosticsPath: opt('DIAGNOSTICS_PATH', './diagnostics'),
    observationMode: parseBool(env.OBSERVATION_MODE, true),
    pollIntervalSeconds: intFrom(env, 'POLL_INTERVAL_SECONDS', 60),
    sendRatePerMinute: intFrom(env, 'SEND_RATE_PER_MINUTE', 6),
    maxSendRetries: intFrom(env, 'MAX_SEND_RETRIES', 5),

    // Media safety + retention
    mediaRetentionDays: intFrom(env, 'MEDIA_RETENTION_DAYS', 90),
    maxImagesPerMessage: intFrom(env, 'MAX_IMAGES_PER_MESSAGE', 4),
    maxAttachmentBytes: intFrom(env, 'MAX_ATTACHMENT_BYTES', 5 * 1024 * 1024),
    allowedImageMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],

    // Dashboard auth
    dashboardUser: opt('DASHBOARD_USER', 'admin'),
    dashboardPassword: opt('DASHBOARD_PASSWORD', ''),

    // Shop
    shopName: opt('SHOP_NAME', 'the shop'),
    timezone: opt('SHOP_TIMEZONE', 'America/New_York'),
    defaultMinutes: intFrom(env, 'DEFAULT_APPOINTMENT_MINUTES', 60),
    cronSchedule: opt('CRON_SCHEDULE', '*/5 * * * *'),
    maxClarificationRounds: intFrom(env, 'MAX_CLARIFICATION_ROUNDS', 3),

    // App
    port: intFrom(env, 'PORT', 3000),
    dbPath: opt('DB_PATH', './data.db'),
    tokenPath: opt('TOKEN_PATH', './google-token.json'),
    publicUrl: opt('PUBLIC_URL', ''),
  };
}

export const config = buildConfig();
