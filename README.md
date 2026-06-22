# Google Voice appointment bot (Claude-powered)

Customers text your **Google Voice** number to book car repairs. This app drives
a persistent **Playwright/Chromium** session signed in to Google Voice to read
and (once enabled) reply to messages. It:

1. **Polls** Google Voice on a schedule, fingerprinting each message so nothing
   is processed twice.
2. **Routes** the owner line (`732-822-8376` by default) to private
   approvals/clarifications, and everyone else into the customer pipeline.
3. Uses **Claude** to extract the date, time, vehicle, and service — and to make
   conservative, non-diagnostic observations about any attached photos.
4. **Books** clear requests on **Google Calendar** and queues a customer
   confirmation.
5. Builds a **private pricing recommendation** for the owner from an editable
   price book plus comparable past jobs. Nothing priced reaches a customer until
   the owner replies `APPROVE`, `EDIT <amount or range>`, or `NOQUOTE`.

A secured dashboard at `http://localhost:3000` shows browser health, the queue,
pending approvals, recent messages with image thumbnails, and the price book.

> **No Google Voice API.** Consumer Google Voice has no supported messaging API,
> so this uses browser automation. It can break when Google changes the UI, and
> it never stores your Google password or bypasses MFA — you sign in by hand once
> to seed the browser profile.

---

## How it flows

```
Customer text ─▶ Google Voice ─(poll via Chromium)─▶ normalize + fingerprint ─▶ SQLite
                                                                 │
                              owner line? ──────────────────────┤
                              │                                  │
                       APPROVE/EDIT/NOQUOTE              customer message
                              │                                  │
                              ▼                                  ▼
                    release non-binding              Claude extract (+images)
                    estimate to customer                         │
                                                 enough info? ─▶ Calendar ✅ + confirm
                                                         │
                                                     not sure ─▶ private question to owner
                                                                         │
                                          after booking ─▶ private price recommendation to owner
```

All outbound messages go through a **durable outbox** with idempotency keys,
sequential sending, rate limits, retries with backoff, and recipient
verification immediately before each send. While **observation mode** is on, the
service parses and routes but **never sends**.

---

## Prerequisites

- **Node.js 18+** (Node 24 recommended)
- A **Google account** that receives the Google Voice texts
- An **Anthropic API key** — https://console.anthropic.com

---

## Setup

### 1. Install
```bash
cp .env.example .env       # fill in every value (see comments in that file)
npm install
npx playwright install chromium
```

### 2. Google Calendar credentials (Calendar only — no Gmail)
In the **Google Cloud Console**:
1. Create/pick a project. **APIs & Services → Library** → enable **Google
   Calendar API**.
2. **OAuth consent screen** → set up (External is fine); add yourself as a test
   user.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
4. Add redirect URI exactly: `http://localhost:5555`.
5. Copy **Client ID** / **Client secret** into `.env`.

Then authorize once:
```bash
npm run auth
```
This saves `google-token.json` (used for Calendar). For headless hosts, paste
its contents into `GOOGLE_TOKEN_JSON`.

### 3. Seed the Google Voice browser session (you sign in by hand)
```bash
npm run seed-profile
```
A real Chromium window opens using the persistent profile at `GV_PROFILE_PATH`.
**Sign in to Google, complete 2-step verification, and open Messages**, then
close the window. The logged-in session is saved into the profile directory.
The app never sees or stores your password.

### 4. Run it
```bash
npm start          # starts the server + scheduled polling
# or a single cycle:
npm run run-once
```
Open **http://localhost:3000** and log in with `DASHBOARD_USER` /
`DASHBOARD_PASSWORD`. It starts in **observation mode** (`OBSERVATION_MODE=true`)
— it reads and routes but sends nothing until you flip the switch.

---

## Owner workflow

- Booking clarifications and price approvals arrive as messages on your owner
  line.
- For a price approval, reply with exactly one of:
  - `APPROVE` — send the recommended estimate to the customer.
  - `EDIT 200` or `EDIT 180-240` — send your adjusted estimate.
  - `NOQUOTE` — send nothing.
- Anything ambiguous gets a private "reply APPROVE / EDIT / NOQUOTE" correction;
  no price is ever sent on a vague reply.

Customer estimates are always explicitly **non-binding**.

---

## Configuration (in `.env`)

| Variable | What it does |
|---|---|
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` (default). Cheaper: `claude-haiku-4-5`. Strongest: `claude-opus-4-8`. |
| `OWNER_PHONE_NUMBER` | The owner line. Only messages from here are owner input. Stored normalized to 10 digits. |
| `OBSERVATION_MODE` | `true` = parse/route but never send (default). Set `false` only after the live smoke test. |
| `GV_PROFILE_PATH` | Persistent Chromium profile directory. |
| `MEDIA_PATH` / `DIAGNOSTICS_PATH` | Where images / diagnostic screenshots are stored. |
| `POLL_INTERVAL_SECONDS` | Inbox poll frequency. |
| `SEND_RATE_PER_MINUTE` | Outbound rate limit. |
| `MAX_SEND_RETRIES` | Retries before a send is marked failed. |
| `MEDIA_RETENTION_DAYS` | Days to keep downloaded media (default 90). |
| `MAX_IMAGES_PER_MESSAGE` / `MAX_ATTACHMENT_BYTES` | Image safety limits. |
| `DASHBOARD_USER` / `DASHBOARD_PASSWORD` | Dashboard login (no password = locked). |
| `GOOGLE_CALENDAR_ID` | `primary`, or a specific calendar ID. |
| `SHOP_TIMEZONE` | IANA zone used to read "Tuesday at 2". |
| `DEFAULT_APPOINTMENT_MINUTES` | Length when unspecified (default 60). |
| `CRON_SCHEDULE` | Poll schedule (default `*/5 * * * *`). |

---

## Deploy to Render (Docker)

The repo includes a **Docker `render.yaml` blueprint**. Chromium needs more
memory than the free tier, so it uses a paid instance with a `/data` persistent
disk holding the SQLite DB, the browser profile, media, and diagnostics.

1. **Authorize Calendar locally** (`npm run auth`) and copy `google-token.json`
   contents for `GOOGLE_TOKEN_JSON`.
2. **Seed the Google Voice profile** locally (`npm run seed-profile`) and copy
   the profile directory onto the service's `/data/google-voice-profile` (e.g.
   via a Render shell `scp`/upload, or by running the seed on a machine with a
   display and syncing the folder). The app never stores a password.
3. **Push to a private Git repo** and create the Blueprint in Render. Fill in the
   prompted secrets (`ANTHROPIC_API_KEY`, `GOOGLE_*`, `OWNER_PHONE_NUMBER`,
   `DASHBOARD_USER`/`DASHBOARD_PASSWORD`, `SHOP_*`).
4. **Deploy in observation mode** (the blueprint default). Open the dashboard
   and verify: login health is green, conversations parse, deduplication holds,
   owner routing works, images download, and recipient selection is correct —
   all **without sending**.
5. **Enable sending** only after the live checklist
   (`docs/google-voice-live-test-checklist.md`) passes: set `OBSERVATION_MODE`
   to `false` (env var or the dashboard toggle).

`/healthz` is public for Render's health check; every other route requires the
dashboard credentials.

---

## Verifying before you enable sending

Run the automated gate and the staged live checklist in
[`docs/google-voice-live-test-checklist.md`](docs/google-voice-live-test-checklist.md):

```bash
npm ci && npm test && npm run lint
docker build -t gv-appointment-bot .
docker run --rm gv-appointment-bot node --test
```

Then deploy in observation mode and walk the checklist (login health,
conversation parsing, deduplication, owner routing, images, recipient
selection). Only after those pass should you set `OBSERVATION_MODE=false` and
validate the controlled-send flows.

---

## Notes & caveats

- **Fragility:** Google Voice selectors live in `src/google-voice/selectors.js`.
  A UI change is a one-file fix; record the verified date in the live checklist.
- **Safety:** observation mode is the default; sends require an explicit flip.
  Recipient identity is re-verified immediately before every send.
- **Privacy:** `.env`, `google-token.json`, `data.db`, the browser profile,
  `media/`, and `diagnostics/` hold secrets/customer data — all git-ignored.
- **Dedup:** messages are fingerprinted (conversation + sender + timestamp +
  normalized body + attachment metadata); restarts never re-process or
  double-book.

---

## Project layout

```
src/
  server.js              Express app: secured dashboard, routes, schedulers
  run-once.js            One automation cycle (poll → process → drain); CLI entry
  processor.js           Routing, booking, clarifications, pricing handoff
  router.js              Owner vs customer routing + approval handling
  approvals.js           Strict APPROVE / EDIT / NOQUOTE parser
  pricing.js             Deterministic price baseline + non-binding wording
  history.js             Comparable past-job selection
  claude.js              Claude tool-use: appointment extraction + image observations
  google.js              Calendar OAuth + event creation
  media.js               Attachment validation + atomic storage
  retention.js           Media/diagnostics retention (contained, DB-driven)
  auth.js                Constant-time dashboard auth
  dashboard.js           Dashboard rendering + price-book validation
  db.js                  SQLite schema + repositories
  config.js              Env config + owner-number normalization
  time.js                Timezone-safe date helpers
  google-voice/
    session.js           Persistent browser session, mutex, health, screenshots
    browser.js           Playwright persistent-context launcher
    inbox.js             Conversation/message/image parsing + polling
    outbox.js            Durable send queue (idempotency, backoff, rate limit)
    sender.js            Composer orchestration + recipient verification
    normalize.js         Phone/body normalization + fingerprints
    selectors.js         Centralized (fragile) Google Voice DOM selectors
    types.js             Shared JSDoc typedefs + browser states
scripts/
  setup-google-auth.js          One-time Calendar authorization
  seed-google-voice-profile.js  Interactive Google Voice sign-in (no passwords)
  lint.js                       Syntax-check lint
Dockerfile               Playwright-based image for Render
render.yaml              Render Docker blueprint
```
