// One-time Google authorization.
//   1. Prints a URL — open it, pick your Google account, allow access.
//   2. Google redirects to http://localhost:5555 (must match GOOGLE_REDIRECT_URI
//      and an Authorized redirect URI on your OAuth client).
//   3. This script catches the code, swaps it for tokens, and saves them.
import http from 'http';
import fs from 'fs';
import { URL } from 'url';
import { makeOAuthClient, SCOPES } from '../src/google.js';
import { config } from '../src/config.js';

const redirect = new URL(config.googleRedirectUri);
const port = redirect.port || 5555;

const oAuth2Client = makeOAuthClient();
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',     // get a refresh token
  prompt: 'consent',          // force a refresh token even on re-auth
  scope: SCOPES,
});

console.log('\n1) Open this URL in your browser and authorize access:\n');
console.log(authUrl + '\n');
console.log(`2) Waiting for Google to redirect back to ${config.googleRedirectUri} ...\n`);

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, config.googleRedirectUri);
    const code = u.searchParams.get('code');
    if (!code) {
      res.writeHead(400).end('No authorization code found.');
      return;
    }
    const { tokens } = await oAuth2Client.getToken(code);
    fs.writeFileSync(config.tokenPath, JSON.stringify(tokens, null, 2));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>Authorized.</h2><p>You can close this tab and return to the terminal.</p>');
    console.log(`Success. Token saved to ${config.tokenPath}.`);
    if (!tokens.refresh_token) {
      console.log('\nNote: no refresh_token was returned. If access expires later, ' +
        'remove the app at https://myaccount.google.com/permissions and run "npm run auth" again.');
    }
    server.close(() => process.exit(0));
  } catch (err) {
    console.error('Authorization failed:', err.message);
    res.writeHead(500).end('Authorization failed. Check the terminal.');
    server.close(() => process.exit(1));
  }
});

server.listen(port, () => {
  console.log(`(local listener running on port ${port})`);
});
