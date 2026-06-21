import twilio from 'twilio';
import { config } from './config.js';

let client;
function getClient() {
  if (!client) client = twilio(config.twilioSid(), config.twilioToken());
  return client;
}

// Text the shop owner's personal phone.
export async function textOwner(body) {
  return getClient().messages.create({
    from: config.twilioFrom(),
    to: config.ownerPhone(),
    body,
  });
}

// Normalize phone numbers to compare the webhook sender against the owner.
export function sameNumber(a, b) {
  const digits = (s) => (s || '').replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
  return digits(a) === digits(b) && digits(a).length >= 10;
}

// Re-export the request validator so the webhook can optionally verify signatures.
export const validateRequest = twilio.validateRequest;
