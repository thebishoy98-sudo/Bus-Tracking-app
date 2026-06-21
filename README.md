# Google Voice → Calendar appointment bot (Claude-powered)

Customers text your **Google Voice** number to book car repairs. This app:

1. **Scans** new texts on a schedule (Google Voice forwards them to Gmail; the app reads Gmail).
2. Uses **Claude** to pull out the date, time, vehicle, and what's being fixed.
3. **Books** the appointment on your **Google Calendar**.
4. When a message is vague, it **texts your personal phone** (via Twilio) to ask. You **reply with the answer**, and it finishes booking — no double-texting, one question at a time.

There's also a small web dashboard at `http://localhost:3000` showing what's booked, what's queued, and what needs your reply.

> **Why Gmail instead of reading Google Voice directly?** Google Voice has no public API. The supported, durable way to get your texts programmatically is Google Voice's built-in *forward-to-email* feature, then read them with the official Gmail API. That's what this uses.

---

## How it flows

```
Customer text ──▶ Google Voice ──(forward)──▶ Gmail
                                                 │
                          every few minutes ◀────┘  (cron scan)
                                 │
                                 ▼
                              Claude  ──── enough info? ──▶ Google Calendar  ✅ booked
                                 │
                              not sure
                                 ▼
                        Twilio text to YOUR phone  ──▶  you reply  ──▶  Claude  ──▶  Calendar ✅
```

---

## Prerequisites

- **Node.js 18+**
- A **Google account** (the one receiving Google Voice texts)
- An **Anthropic API key** — https://console.anthropic.com
- A **Twilio account** + one SMS-capable phone number — https://twilio.com

---

## Setup

### 1. Turn on Google Voice → email forwarding
In Google Voice: **Settings → Messages → "Forward messages to email"** (turn on). Now every incoming text also lands in your Gmail. (Optional: also forward voicemail.)

### 2. Create Google API credentials
In the **Google Cloud Console** (https://console.cloud.google.com):
1. Create a project (or pick one).
2. **APIs & Services → Library** → enable **Gmail API** and **Google Calendar API**.
3. **APIs & Services → OAuth consent screen** → set it up (External is fine), and under **Test users** add your own Google address.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
5. Under **Authorized redirect URIs**, add exactly: `http://localhost:5555`
6. Copy the **Client ID** and **Client secret** into your `.env`.

### 3. Configure the app
```bash
cp .env.example .env
# open .env and fill in every value (see comments in that file)
npm install
```

### 4. Authorize Google (one time)
```bash
npm run auth
```
This prints a URL. Open it, choose your account, allow access. It saves a token to `google-token.json`. (If you ever revoke access, just run it again.)

### 5. Point Twilio's number at the app
Your phone replies have to reach the app, so it needs a public URL.

- **Local testing:** install [ngrok](https://ngrok.com), run `ngrok http 3000`, copy the `https://…ngrok…` URL.
- In the **Twilio Console → your number → Messaging → "A message comes in"**, set a **Webhook (HTTP POST)** to: `https://YOUR-PUBLIC-URL/sms/incoming`
- Put that same base URL in `.env` as `PUBLIC_URL=` to enable signature verification (recommended).

### 6. Run it
```bash
npm start
```
Open **http://localhost:3000**. It scans on startup and then every few minutes. Text your Google Voice number to test.

To run a single scan from the terminal without the server:
```bash
npm run run-once
```

---

## Configuration (in `.env`)

| Variable | What it does |
|---|---|
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` (default, good date reasoning). Cheaper: `claude-haiku-4-5`. Strongest: `claude-opus-4-8`. |
| `GMAIL_QUERY` | Gmail search selecting your Voice texts. Default targets `txt.voice.google.com`. |
| `GOOGLE_CALENDAR_ID` | `primary`, or a specific calendar's ID. |
| `SHOP_TIMEZONE` | IANA zone (e.g. `America/Chicago`) used to read "Tuesday at 2". |
| `DEFAULT_APPOINTMENT_MINUTES` | Length when the customer doesn't say (default 60). |
| `CRON_SCHEDULE` | Scan frequency, cron syntax (default `*/5 * * * *` = every 5 min). |
| `MAX_CLARIFICATION_ROUNDS` | How many follow-up texts before it gives up (default 3). |
| `OWNER_PHONE_NUMBER` | Your cell. Questions go here; only replies from here are accepted. |

Want it to ask you *more* or *less* often? Edit the guidance in `src/claude.js` (the `systemPrompt`) — it currently errs toward asking whenever a date or time is missing or vague.

---

## Deploy to Render

This repo includes a **`render.yaml` blueprint**, so most of the setup is filling in secrets. The app runs as one always-on web service that handles both the scheduled scan and your reply webhook.

> **Heads up on cost:** this needs to stay running to scan on schedule. Render's *free* web service sleeps after ~15 min of inactivity (which stops the scanning) and has no persistent disk (which would reset the database and risk re-booking old texts). So the blueprint uses the **Starter** instance (~$7/mo) with a 1 GB disk. That's the realistic minimum for this app.

**Steps:**

1. **Generate your Google token locally first.** On your own computer, after filling in `.env`, run:
   ```bash
   npm install && npm run auth
   ```
   This creates `google-token.json`. Open it and copy the whole contents (it's one JSON object) — you'll paste it into Render as `GOOGLE_TOKEN_JSON`. (Doing auth locally is necessary because the Google sign-in needs a real browser; a server can't click "Allow" for you.)

2. **Push this project to a private Git repo** (GitHub, GitLab, or Bitbucket). Render Blueprints deploy from Git.

3. **Create the Blueprint.** In Render: **New ▸ Blueprint**, connect the repo. Render reads `render.yaml` and prompts you for each secret:
   - `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_TOKEN_JSON` ← paste the file contents from step 1
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `OWNER_PHONE_NUMBER`
   - `SHOP_NAME`, `SHOP_TIMEZONE`
   
   Click **Deploy**.

4. **Grab your URL** (e.g. `https://gv-appointment-bot.onrender.com`). Then:
   - In Render ▸ your service ▸ **Environment**, set `PUBLIC_URL` to that URL and save (this turns on Twilio signature verification).
   - In **Twilio Console ▸ your number ▸ Messaging ▸ "A message comes in"**, set the **Webhook (POST)** to `https://YOUR-URL/sms/incoming`.

5. **Test:** open your Render URL to see the dashboard, then text your Google Voice number. Watch it appear, get booked, or trigger a clarification text to your phone.

When you change anything in `render.yaml` later and push, Render redeploys automatically. (Secrets you entered in the dashboard are preserved.)

### Other hosts

The same idea works on any always-on host (Fly.io, Railway, a VPS): set the same environment variables (use `GOOGLE_TOKEN_JSON` instead of shipping the token file), make sure the process stays up (e.g. `pm2 start src/server.js`), and point Twilio's webhook at `https://YOUR-URL/sms/incoming`. The built-in scheduler means you don't need a system crontab.

---

## Notes & caveats

- **First-run safety:** test with your own phone first. Claude is told to ask rather than guess, but review the calendar until you trust it.
- **Costs:** Claude charges per message parsed (a few cents at most on Sonnet, less on Haiku). Twilio charges per SMS. Gmail/Calendar APIs are free at this volume.
- **Privacy/security:** `.env`, `google-token.json`, and `data.db` hold secrets and customer data — they're git-ignored; keep them off public servers/repos. Set `PUBLIC_URL` to verify Twilio webhook signatures.
- **State:** everything is stored in a local SQLite file (`data.db`). Messages are de-duplicated by Gmail ID, so re-scanning never double-books.
- **Forwarding-email format:** Google occasionally tweaks the layout of forwarded texts. The app hands the raw body to Claude (which is robust to format changes) rather than relying on brittle parsing, but if your texts come from a different sender, adjust `GMAIL_QUERY`.

---

## Project layout

```
src/
  server.js      Express app: Twilio webhook, dashboard, cron scheduler
  processor.js   Core pipeline: ingest → parse → book → clarify
  google.js      OAuth client, Gmail reading, Calendar event creation
  claude.js      Claude tool-use call that extracts appointment fields
  twilio.js      Sends clarification texts to you
  dashboard.js   Renders the status page
  db.js          SQLite schema + queries
  time.js        Timezone-safe date helpers
  config.js      Loads/validates .env
  run-once.js    One-off scan from the CLI
scripts/
  setup-google-auth.js   One-time Google authorization
render.yaml      Render deployment blueprint
```
