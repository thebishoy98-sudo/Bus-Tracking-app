// Strict parser for the only owner replies that may release a customer quote.
// Anything that is not unambiguously APPROVE / EDIT <amount|range> / NOQUOTE is
// rejected as "unknown" so a casual "sounds good" can never send a price.

const NUM = '\\$?\\s*(\\d+(?:\\.\\d+)?)';

export function parseApprovalCommand(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { type: 'unknown' };

  const upper = text.toUpperCase();

  // APPROVE — must be the whole message (optionally with trailing punctuation).
  if (/^APPROVE[.!]?$/.test(upper)) return { type: 'approve' };

  // NOQUOTE / NO QUOTE.
  if (/^NO\s?QUOTE[.!]?$/.test(upper)) return { type: 'noquote' };

  // EDIT <amount> or EDIT <low>-<high> (dash, en/em dash, or "to").
  const editMatch = upper.match(/^EDIT\b(.*)$/);
  if (editMatch) {
    const rest = editMatch[1];
    const rangeRe = new RegExp(`${NUM}\\s*(?:-|–|—|TO)\\s*${NUM}`);
    const range = rest.match(rangeRe);
    if (range) {
      let low = Number(range[1]);
      let high = Number(range[2]);
      if (high < low) [low, high] = [high, low];
      return { type: 'edit', low, high };
    }
    const single = rest.match(new RegExp(`^\\s*${NUM}\\s*$`));
    if (single) {
      const amount = Number(single[1]);
      return { type: 'edit', low: amount, high: amount };
    }
    return { type: 'unknown' };
  }

  return { type: 'unknown' };
}

export default { parseApprovalCommand };
