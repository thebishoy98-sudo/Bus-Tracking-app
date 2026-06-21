// Centralized Google Voice DOM selectors.
//
// Google Voice ships no public messaging API, so these CSS/text selectors are
// the contract with an undocumented UI and WILL break when Google changes it.
// Keep them all here so a UI change is a one-file fix, and record the verified
// date/version in docs/google-voice-live-test-checklist.md whenever they change.
//
// Last hand-verified: (unverified — set during the live smoke test, Task 14)

export const URLS = {
  base: 'https://voice.google.com',
  messages: 'https://voice.google.com/u/0/messages',
};

// Signals that we are logged out or facing an auth challenge rather than the inbox.
export const AUTH = {
  // Any of these being present means we are NOT on the messaging surface.
  loginIndicators: [
    'input[type="email"]',
    'input[type="password"]',
    '#identifierId',
    'form[action*="signin"]',
    'div[data-challenge-ui]',
  ],
  // Presence of this signals a healthy, logged-in messaging view.
  readyIndicators: [
    'gv-thread-list',
    '[gv-test-id="thread-list"]',
    'nav[role="navigation"]',
  ],
};

// Conversation list (left rail).
export const THREADS = {
  list: 'gv-thread-list',
  item: 'gv-thread-item',
  itemPhone: '[data-thread-id]',
  unread: '.unread, [aria-label*="unread" i]',
};

// Open conversation message stream.
export const MESSAGES = {
  container: 'gv-conversation, [gv-test-id="conversation"]',
  bubble: 'gv-message-item, [gv-test-id="message"]',
  incoming: '.incoming, [data-is-outgoing="false"]',
  outgoing: '.outgoing, [data-is-outgoing="true"]',
  text: '.gv-message-text, [gv-test-id="message-text"]',
  timestamp: '.gv-message-time, time',
  attachmentImage: 'img.gv-attachment, [gv-test-id="attachment"] img',
};

// Composer (used by the sender; never touched in observation mode).
export const COMPOSER = {
  recipientChip: '[gv-test-id="recipient-chip"], .recipient-chip',
  recipientInput: 'input[aria-label*="recipient" i], input[placeholder*="phone" i]',
  textInput: 'textarea[aria-label*="message" i], [gv-test-id="message-input"] textarea',
  attachButton: 'button[aria-label*="attach" i], button[aria-label*="image" i]',
  fileInput: 'input[type="file"]',
  sendButton: 'button[aria-label*="send" i], [gv-test-id="send-button"]',
  // Element that appears only after the UI confirms the message was sent.
  sentConfirmation: '[data-is-outgoing="true"] [aria-label*="sent" i], .gv-message-sent',
};

export default { URLS, AUTH, THREADS, MESSAGES, COMPOSER };
