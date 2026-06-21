// Shared type definitions (JSDoc) for the Google Voice adapter. These document
// the shapes that flow between the browser layer and the application services.

/**
 * @typedef {Object} RawMessage
 * Raw data scraped from the Google Voice DOM before normalization.
 * @property {string} conversationId  Stable id/handle for the conversation thread.
 * @property {string} [senderNumber]  Phone number of the sender, any format.
 * @property {string} [senderName]    Display name if Google Voice shows one.
 * @property {boolean} [isOutgoing]   True when the message was sent from this account.
 * @property {string} [direction]     Explicit 'inbound' | 'outbound' if known.
 * @property {string} timestamp       ISO-ish timestamp string from the DOM.
 * @property {string} [text]          Message text.
 * @property {RawAttachment[]} [attachments]
 */

/**
 * @typedef {Object} RawAttachment
 * @property {string} [url]       Ephemeral download URL (excluded from fingerprints).
 * @property {string} [mime]      MIME type if known.
 * @property {string} [name]      File name if known.
 * @property {number} [byteSize]  Size in bytes if known.
 */

/**
 * @typedef {Object} Attachment
 * @property {'image'|'other'} kind
 * @property {string} mime
 * @property {string} ext
 * @property {string} name
 * @property {number|null} byteSize
 * @property {string|null} url
 */

/**
 * @typedef {Object} NormalizedMessage
 * @property {string|null} conversationId
 * @property {string} senderNumber       Normalized 10-digit number ('' if unknown).
 * @property {string|null} senderName
 * @property {'inbound'|'outbound'} direction
 * @property {string} body               Whitespace-normalized text.
 * @property {string} rawBody            Original text as scraped.
 * @property {string|null} timestamp
 * @property {boolean} isOwner           True when the sender is the owner line.
 * @property {boolean} hasAttachments
 * @property {Attachment[]} attachments
 * @property {string} fingerprint        Deterministic SHA-256 dedup key.
 */

/**
 * Browser/session readiness states surfaced to health and the dashboard.
 * @typedef {'unknown'|'ready'|'logged_out'|'challenged'|'error'} BrowserState
 */

export const BROWSER_STATES = Object.freeze({
  UNKNOWN: 'unknown',
  READY: 'ready',
  LOGGED_OUT: 'logged_out',
  CHALLENGED: 'challenged',
  ERROR: 'error',
});

export {};
