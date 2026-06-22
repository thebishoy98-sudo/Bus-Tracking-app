# Google Voice automation — live acceptance checklist

Google Voice has no supported messaging API, so the browser adapter depends on
an undocumented UI. This checklist gates turning on **sending**. Keep
`OBSERVATION_MODE=true` until every observation-mode item below passes.

> **Rule:** sending stays OFF until inbox parsing, recipient selection,
> deduplication, images, and owner routing are all verified live.

---

## 0. Automated gate (run before deploying)

Run locally / in CI; all must pass:

- [ ] `npm ci` completes cleanly
- [ ] `npm test` → all tests pass (135 at time of writing)
- [ ] `npm run lint` → `lint ok`
- [ ] `docker build -t gv-appointment-bot .` succeeds
- [ ] `docker run --rm gv-appointment-bot node --test` passes (runs the suite in the image)

Status (fill in): date `__________`  results `__________`

---

## 1. Seed + deploy in observation mode

- [ ] Calendar authorized locally (`npm run auth`), `GOOGLE_TOKEN_JSON` set on host
- [ ] Google Voice profile seeded by hand (`npm run seed-profile`) — signed in,
      2-step verification completed, Messages visible. No password stored anywhere.
- [ ] Profile directory present on the host at `GV_PROFILE_PATH`
      (`/data/google-voice-profile` on Render)
- [ ] Deployed with `OBSERVATION_MODE=true`
- [ ] Dashboard reachable and requires login (`DASHBOARD_USER`/`DASHBOARD_PASSWORD`)
- [ ] `/healthz` returns `{ ok: true }` without auth; every other route returns 401 without auth

## 2. Login health

- [ ] Dashboard "Browser" status shows **ready**
- [ ] If logged out/challenged: status shows **login required** and a diagnostic
      screenshot was captured (re-seed the profile, then re-check)

## 3. Conversation parsing (no sending)

- [ ] Send a few test texts to the Google Voice number from a non-owner phone
- [ ] After a poll cycle, the messages appear under "Recent messages"
- [ ] Sender name/number and body render correctly and are HTML-escaped
- [ ] Outbound (your own) messages are NOT ingested as inbound

## 4. Deduplication

- [ ] Trigger several poll cycles (use "Scan now") over the same conversations
- [ ] No message is duplicated in the dashboard or DB
- [ ] Restart the service; re-scan — still no duplicates, no re-booking

## 5. Owner routing

- [ ] A message from the owner line (`732-822-8376` or your `OWNER_PHONE_NUMBER`)
      is treated as owner input, never as a customer booking
- [ ] A message from any other number is treated as a customer

## 6. Images

- [ ] Send a text with a photo from a test customer number
- [ ] The image downloads, validates, and shows as a thumbnail (served from `/media/...`)
- [ ] An unsupported type or oversized file is recorded as **rejected** (no bytes stored, never executed)

## 7. Recipient selection (still observation mode)

- [ ] Confirm queued outbound messages target the correct conversation/number
      (inspect the outbox / dashboard). Nothing is actually sent yet.

---

## 8. Enable sending — controlled test numbers only

Flip `OBSERVATION_MODE=false` (env var or dashboard toggle). Use phones you control.

- [ ] **Clarification:** send a vague booking ("need brakes sometime") →
      a private question reaches the owner line; nothing goes to the customer
- [ ] Owner replies with details → appointment is booked on Calendar and a
      confirmation is sent to the customer conversation
- [ ] **Booking (clear):** send a complete request → booked + customer confirmation
- [ ] **Recipient verification:** confirm each send went to the intended number
      only (the sender re-verifies the selected recipient before submitting)
- [ ] **Pricing — APPROVE:** after a booking, owner gets a private recommendation;
      reply `APPROVE` → non-binding estimate reaches the customer
- [ ] **Pricing — EDIT:** reply `EDIT 180-240` → adjusted non-binding estimate sent
- [ ] **Pricing — NOQUOTE:** reply `NOQUOTE` → nothing sent to the customer
- [ ] **Ambiguous owner reply:** reply "sounds good" → owner gets a correction
      prompt; no price is sent
- [ ] **Image send (if used):** an approved outbound image attaches via the composer

## 9. Restart / idempotency

- [ ] Restart the service mid-flow
- [ ] No inbound message is re-ingested, no calendar event is duplicated, and no
      outbound send is repeated (idempotency keys hold)

---

## 10. Selector / version record

Record whenever selectors in `src/google-voice/selectors.js` are verified or
changed against the live UI.

| Date | Verified by | Google Voice UI notes | Selectors changed? | Result |
|------|-------------|------------------------|--------------------|--------|
|      |             |                        |                    |        |

Also note the app + Playwright versions used:

- App commit: `__________`
- Playwright: `1.49.1`
- Chromium (from Playwright image): `__________`
- Date verified: `__________`
