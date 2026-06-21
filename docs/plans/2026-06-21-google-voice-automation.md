# Google Voice Automation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Gmail and Twilio with Render-hosted Google Voice browser automation, including images and owner-approved price recommendations.

**Architecture:** A Playwright adapter owns all Google Voice reads and writes while application services communicate through normalized messages and a durable SQLite outbox. Google Calendar remains API-based; Claude extracts appointments, summarizes images, and recommends prices from a price book plus historical conversations.

**Tech Stack:** Node.js, Express, Playwright/Chromium, better-sqlite3, Anthropic SDK, Google Calendar API, Node built-in test runner, Render Docker.

---

### Task 1: Establish the test harness and configuration

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `src/config.js`
- Create: `test/config.test.js`

**Steps:**
1. Write failing tests for normalized owner number, browser profile path, media path, observation mode, dashboard credentials, polling interval, send rate, and retention days.
2. Run `npm test`; expect configuration assertions to fail.
3. Add `node --test` scripts, Playwright dependencies, and the new configuration while removing Twilio-specific configuration.
4. Run `npm test`; expect the configuration suite to pass.
5. Commit with `git commit -m "test: establish google voice automation harness"` after Git is initialized.

### Task 2: Add the durable data model

**Files:**
- Modify: `src/db.js`
- Create: `test/db.test.js`

**Steps:**
1. Write failing tests for conversations, inbound messages, attachments, outbox idempotency, pending owner actions, price-book entries, and automation health.
2. Run `node --test test/db.test.js`; expect missing store methods.
3. Add additive SQLite migrations and focused repository methods. Preserve existing appointment rows during migration.
4. Run the database tests and verify duplicate message fingerprints and outbox keys are rejected.
5. Commit with `git commit -m "feat: add messaging and pricing data model"`.

### Task 3: Define a testable Google Voice adapter

**Files:**
- Create: `src/google-voice/types.js`
- Create: `src/google-voice/normalize.js`
- Create: `src/google-voice/selectors.js`
- Create: `test/google-voice-normalize.test.js`
- Create: `test/fixtures/google-voice/README.md`

**Steps:**
1. Write failing tests for phone normalization, stable message fingerprints, inbound/outbound classification, attachment metadata, and owner-number matching.
2. Run the focused test and confirm failure.
3. Implement pure normalization and fingerprint functions independent of Playwright.
4. Run tests and confirm deterministic results across repeated scans.
5. Commit with `git commit -m "feat: define normalized google voice messages"`.

### Task 4: Implement the persistent browser session and health state

**Files:**
- Create: `src/google-voice/browser.js`
- Create: `src/google-voice/session.js`
- Create: `test/google-voice-session.test.js`
- Modify: `src/db.js`

**Steps:**
1. Write failing adapter tests using injected fake pages for ready, logged-out, challenged, and selector-failure states.
2. Run the focused test and confirm failure.
3. Launch a persistent Chromium context at the configured profile path, serialize access with a mutex, detect authentication state, and persist health timestamps/errors.
4. Capture bounded diagnostic screenshots without logging message contents.
5. Run tests and commit with `git commit -m "feat: manage persistent google voice browser session"`.

### Task 5: Read conversations, messages, and images

**Files:**
- Create: `src/google-voice/inbox.js`
- Create: `src/media.js`
- Create: `test/google-voice-inbox.test.js`
- Create: `test/media.test.js`

**Steps:**
1. Save sanitized DOM fixtures for conversation list, text messages, image messages, empty inbox, and logged-out state.
2. Write failing tests that parse fixtures into normalized messages without duplicates.
3. Implement bounded inbox polling, lazy conversation traversal, attachment download, MIME/size validation, and atomic media writes.
4. Verify unsupported or oversized files are rejected and recorded without execution.
5. Run tests and commit with `git commit -m "feat: ingest google voice text and image messages"`.

### Task 6: Implement the durable Google Voice outbox

**Files:**
- Create: `src/google-voice/outbox.js`
- Create: `src/google-voice/sender.js`
- Create: `test/google-voice-outbox.test.js`
- Create: `test/google-voice-sender.test.js`

**Steps:**
1. Write failing tests for idempotent enqueue, sequential claims, observation mode, recipient verification, text sends, image sends, retries, and login-required suspension.
2. Run the focused tests and confirm failure.
3. Implement transactional claim/send/confirm behavior with bounded exponential backoff and send-rate limits.
4. Require the selected conversation phone number to equal the queued recipient immediately before submission.
5. Run tests and commit with `git commit -m "feat: send durable google voice messages"`.

### Task 7: Route owner replies and customer messages

**Files:**
- Modify: `src/processor.js`
- Create: `src/router.js`
- Create: `src/approvals.js`
- Create: `test/router.test.js`
- Create: `test/approvals.test.js`

**Steps:**
1. Write failing tests proving only `7328228376` is routed as owner input and that approval commands require a matching pending action.
2. Add strict parsers for `APPROVE`, `EDIT <amount-or-range>`, and `NOQUOTE`; reject ambiguous replies with a private correction prompt.
3. Replace direct sends with outbox enqueue calls and route customer confirmations to the originating conversation.
4. Run tests, including duplicate owner-reply replay tests.
5. Commit with `git commit -m "feat: route google voice conversations and approvals"`.

### Task 8: Add image-aware appointment extraction

**Files:**
- Modify: `src/claude.js`
- Modify: `src/processor.js`
- Create: `test/claude-payload.test.js`

**Steps:**
1. Write failing tests for Anthropic request construction with zero, one, and multiple validated images.
2. Update the structured output to include observations, uncertainty, and suggested service categories without definitive diagnoses.
3. Pass only allowlisted retained files and enforce a bounded image count.
4. Run tests with a mocked Anthropic client.
5. Commit with `git commit -m "feat: analyze customer images conservatively"`.

### Task 9: Add editable price-book and historical recommendations

**Files:**
- Create: `src/pricing.js`
- Create: `src/history.js`
- Modify: `src/claude.js`
- Modify: `src/processor.js`
- Create: `test/pricing.test.js`
- Create: `test/history.test.js`

**Steps:**
1. Write failing tests for effective price rows, service matching, vehicle adjustments, historical-comparable selection, confidence thresholds, and non-binding customer wording.
2. Implement deterministic baseline calculations before asking Claude to explain and range the recommendation.
3. Queue the recommendation only to the owner and create a pending pricing approval linked to the customer conversation.
4. Ensure no estimate reaches a customer without `APPROVE` or valid `EDIT`.
5. Run tests and commit with `git commit -m "feat: recommend owner-approved appointment pricing"`.

### Task 10: Remove Gmail and Twilio paths

**Files:**
- Modify: `src/google.js`
- Delete: `src/twilio.js`
- Modify: `src/server.js`
- Modify: `src/run-once.js`
- Modify: `package.json`
- Modify: `.env.example`
- Create: `test/no-legacy-integrations.test.js`

**Steps:**
1. Write a failing test that rejects Twilio imports, Gmail scopes, Gmail configuration, and `/sms/incoming`.
2. Restrict `src/google.js` to Calendar authorization and event creation.
3. Remove the Twilio dependency and webhook; make manual and scheduled runs invoke inbox polling, processing, and outbox draining.
4. Run the complete suite and `npm install` to refresh the lockfile.
5. Commit with `git commit -m "refactor: remove gmail and twilio messaging"`.

### Task 11: Secure and expand the dashboard

**Files:**
- Modify: `src/dashboard.js`
- Modify: `src/server.js`
- Create: `src/auth.js`
- Create: `test/dashboard.test.js`
- Create: `test/auth.test.js`

**Steps:**
1. Write failing tests for authenticated routes, browser health, pending approvals, queue failures, media thumbnails, and price-book CRUD validation.
2. Add constant-time credential verification and require authentication for all dashboard/API/media/configuration routes except `/healthz`.
3. Add price-book editing, automation status, observation-mode controls, retry actions, and escaped media/message rendering.
4. Run security and rendering tests.
5. Commit with `git commit -m "feat: add secured automation dashboard"`.

### Task 12: Add retention and operational controls

**Files:**
- Create: `src/retention.js`
- Modify: `src/server.js`
- Create: `test/retention.test.js`

**Steps:**
1. Write failing tests for 90-day default retention, referenced-file preservation, safe path containment, and diagnostic screenshot cleanup.
2. Implement database-driven cleanup that never deletes outside the configured media directories.
3. Schedule cleanup separately from message polling and expose its last result in health state.
4. Run tests and commit with `git commit -m "feat: enforce media retention policy"`.

### Task 13: Package for Render

**Files:**
- Create: `Dockerfile`
- Modify: `render.yaml`
- Modify: `.gitignore`
- Modify: `README.md`
- Create: `scripts/seed-google-voice-profile.js`

**Steps:**
1. Build a Playwright-compatible Docker image and run `docker build -t gv-appointment-bot .`; expect success.
2. Mount `/data` for database, profile, media, and diagnostics; document the local profile-seeding process without storing passwords.
3. Update Render variables, health checks, startup command, and observation-mode deployment instructions.
4. Verify Twilio and Gmail setup instructions are absent and Calendar OAuth instructions remain.
5. Commit with `git commit -m "chore: package google voice automation for render"`.

### Task 14: Verify with staged acceptance tests

**Files:**
- Create: `docs/google-voice-live-test-checklist.md`
- Modify: `README.md`

**Steps:**
1. Run `npm ci`, `npm test`, `npm run lint`, and the Docker build; require all to pass.
2. Deploy in observation mode and verify login health, conversation parsing, deduplication, owner routing, images, and recipient selection without sending.
3. Enable sending for controlled test numbers; validate clarification, booking, pricing `APPROVE`/`EDIT`/`NOQUOTE`, customer confirmation, and image attachment flows.
4. Restart the service and verify no inbound message, event, or outbound send is duplicated.
5. Record selectors/version/date in the checklist and commit with `git commit -m "test: verify google voice automation workflow"`.

