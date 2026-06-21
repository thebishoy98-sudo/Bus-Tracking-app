# Google Voice Automation Design

## Goal

Replace Gmail and Twilio with a persistent Google Voice browser session that reads and sends text and image messages, books appointments, and privately requests pricing approval from the owner at `732-822-8376`.

## Constraints

- Google Voice consumer messaging has no supported public messaging API. Inbox parsing and sending therefore depend on browser automation and can break when Google changes the UI or requests authentication.
- The service runs unattended on Render. Chromium state, SQLite data, images, and diagnostic screenshots require a persistent disk.
- The application must never store a Google password or attempt to bypass MFA.

## Architecture

Run Playwright Chromium in a Docker-based Render web service. A persistent browser context stored under `/data/google-voice-profile` polls `voice.google.com`, extracts new conversation messages and attachments, and sends durable outbox entries sequentially. SQLite stores conversation IDs, message fingerprints, attachments, approval state, prices, sends, and browser health.

Google Calendar remains API-based. Anthropic handles appointment extraction, image summaries, and price recommendations. Twilio and Gmail integrations are removed.

## Message Flow

1. Poll Google Voice and fingerprint each incoming message using its conversation identity, sender, timestamp, normalized body, and attachment metadata.
2. Route messages from `732-822-8376` to the owner-response handler; route other numbers to the customer appointment pipeline.
3. Download supported image attachments, validate them, and associate them with the message.
4. Use Claude to extract appointment data and conservatively summarize visible image content.
5. For missing appointment information, queue a Google Voice question to the owner.
6. For a complete request, create the Calendar event and queue a customer confirmation.
7. Build a private pricing recommendation from the editable price book and comparable conversation history, then queue it to the owner.
8. Interpret `APPROVE`, `EDIT <range>`, and `NOQUOTE` only in the context of the pending approval. Send an approved, explicitly non-binding estimate to the customer.

## Pricing

The editable price book is the trusted baseline and stores service, labor range, parts range, vehicle adjustments, fees, notes, and effective dates. Prior conversations supply comparable examples, not authoritative prices. Recommendations include a range, confidence, assumptions, and supporting comparisons. Low-confidence estimates are never sent without explicit owner action.

## Images

Accept allowlisted image formats and bounded file sizes. Store files on the persistent disk, show thumbnails in the authenticated dashboard, and pass validated images to Claude vision. Image results are observations rather than diagnoses. Approved outbound images are attached through the Google Voice composer. Default retention is 90 days.

## Reliability and Safety

- Use a durable outbox with idempotency keys. Mark sent only after the Google Voice UI confirms submission.
- Send sequentially with rate limits, bounded retries, and exponential backoff.
- Detect authentication redirects, stop browser work, capture a screenshot, and show `login required` on the dashboard.
- Protect dashboard and setup routes with authentication.
- Start production in observation mode. Enable sending only after live inbox parsing and recipient selection are verified.
- Expose browser health, last successful scan, queue depth, failed messages, pending approvals, and retained media.

## Testing

Unit tests cover normalization, fingerprinting, owner routing, approval commands, price calculations, image validation, outbox idempotency, and retries. Browser adapter tests use saved sanitized Google Voice fixtures. A controlled live smoke test validates selectors and recipient selection before outbound automation is enabled.

