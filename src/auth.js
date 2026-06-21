import crypto from 'node:crypto';

// Constant-time comparison of two strings. Hashing both first keeps the
// comparison constant-time regardless of length differences (so we never leak
// length via early return or a timingSafeEqual length mismatch throw).
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Verify a username/password against the configured credentials. Denies all
// access when no dashboard password is configured (never an open dashboard).
export function verifyCredentials(user, pass, config) {
  if (!config.dashboardPassword) return false;
  // Evaluate both comparisons so timing does not reveal which field was wrong.
  const userOk = safeEqual(user, config.dashboardUser);
  const passOk = safeEqual(pass, config.dashboardPassword);
  return userOk && passOk;
}

export function parseBasicAuth(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') return null;
  const m = headerValue.match(/^Basic\s+(.+)$/i);
  if (!m) return null;
  let decoded;
  try {
    decoded = Buffer.from(m[1], 'base64').toString('utf8');
  } catch {
    return null;
  }
  const idx = decoded.indexOf(':');
  if (idx === -1) return null;
  return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
}

export function isAuthorized(req, config) {
  const creds = parseBasicAuth(req.headers?.authorization);
  if (!creds) return false;
  return verifyCredentials(creds.user, creds.pass, config);
}

// Express middleware enforcing Basic auth. Apply to every route that must be
// protected; mount /healthz before it (or exempt it) so health checks work.
export function requireAuth(config) {
  return (req, res, next) => {
    if (isAuthorized(req, config)) return next();
    res.set('WWW-Authenticate', 'Basic realm="appointment-bot", charset="UTF-8"');
    return res.status(401).send('Authentication required.');
  };
}

export default { verifyCredentials, parseBasicAuth, isAuthorized, requireAuth };
