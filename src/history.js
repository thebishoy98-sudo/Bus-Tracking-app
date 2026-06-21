// Select comparable past jobs to inform (not dictate) a price recommendation.
// Prior conversations are examples only — never authoritative prices.

const STOP = new Set(['the', 'a', 'an', 'and', 'for', 'of', 'to', 'my', 'me', 'need', 'want', 'please']);

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t));
}

// Jaccard-style overlap of service tokens.
function similarity(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const b = new Set(bTokens);
  const shared = aTokens.filter((t) => b.has(t)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return shared === 0 ? 0 : shared / union;
}

// Return priced past jobs similar to `service`, sorted by similarity desc.
export function selectComparables(history = [], { service, limit = 5 } = {}) {
  const target = tokens(service);
  return (history || [])
    .filter((h) => h && h.low != null && h.high != null)
    .map((h) => ({ ...h, similarity: similarity(target, tokens(h.service)) }))
    .filter((h) => h.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export default { selectComparables };
