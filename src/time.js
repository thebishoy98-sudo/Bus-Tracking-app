// Small date helpers that keep everything in the shop's local wall-clock time.
// We never store UTC offsets on the appointment itself: we hand Google Calendar a
// naive local datetime plus the shop's IANA timezone, which sidesteps DST math.

import { config } from './config.js';

// "2026-06-20" in the shop timezone.
export function todayISO(tz = config.timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// Human-friendly "now" for the Claude prompt, e.g.
// "Friday, June 20, 2026, 3:47 PM".
export function nowReadable(tz = config.timezone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date());
}

// Add minutes to a naive local datetime string ("YYYY-MM-DDTHH:MM:SS").
// We treat the string as UTC purely for the arithmetic so the host machine's
// timezone can't interfere; the result is still naive local wall-clock time.
export function addMinutesLocal(localStr, minutes) {
  const base = localStr.length === 16 ? localStr + ':00' : localStr; // tolerate HH:MM
  const d = new Date(base + 'Z');
  d.setUTCMinutes(d.getUTCMinutes() + Number(minutes || 0));
  return d.toISOString().slice(0, 19);
}

// Pretty-print a naive local datetime for texts / the dashboard.
export function formatLocal(localStr, tz = config.timezone) {
  if (!localStr) return '';
  const base = localStr.length === 16 ? localStr + ':00' : localStr;
  // Interpret the naive string as UTC, then format without shifting by reading
  // the same UTC clock back out — gives a clean readable label of the wall time.
  const d = new Date(base + 'Z');
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d);
}
