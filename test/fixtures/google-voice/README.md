# Google Voice DOM fixtures

Sanitized HTML snapshots of the `voice.google.com` messaging UI used by the
adapter tests. They let us parse real-shaped markup without a live browser or
network access.

## Rules

- **Sanitize before committing.** Replace real customer names, phone numbers,
  message text, and image URLs with synthetic values. Never commit a real
  person's data or a working attachment URL.
- One fixture per scenario. Current scenarios:
  - `conversation-list.html` — the left-rail thread list.
  - `thread-text.html` — a conversation containing only text messages.
  - `thread-image.html` — a conversation containing an image attachment.
  - `inbox-empty.html` — a logged-in inbox with no conversations.
  - `logged-out.html` — the sign-in / challenge surface.
- Keep selectors in sync with `src/google-voice/selectors.js`. When Google
  changes the UI, refresh both the fixtures and the selectors, and record the
  date in `docs/google-voice-live-test-checklist.md`.

## Capturing a fresh fixture

1. Open the relevant Google Voice view in a logged-in browser.
2. Copy the `outerHTML` of the messaging root element.
3. Strip scripts/styles, replace identifying data with synthetic values, and
   save it here with the scenario name above.
