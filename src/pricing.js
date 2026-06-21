// Deterministic pricing baseline from the editable price book, optionally
// informed by historical comparables. The price book is the trusted baseline;
// comparables are examples only. Recommendations always go to the owner first.

const STOP = new Set(['the', 'a', 'an', 'and', 'for', 'of', 'to', 'my', 'me', 'need', 'want', 'please', 'replacement', 'job']);

function tokens(text) {
  return String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));
}

function round(n) { return Math.round(n); }

function money(n) {
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function rangeText(low, high) {
  return low === high ? money(low) : `${money(low)}–${money(high)}`;
}

// Best price-book entry by service token overlap (requires ≥1 shared token).
export function matchService(entries = [], serviceText) {
  const target = new Set(tokens(serviceText));
  let best = null;
  let bestScore = 0;
  for (const e of entries) {
    const shared = tokens(e.service).filter((t) => target.has(t)).length;
    if (shared > bestScore) { bestScore = shared; best = e; }
  }
  return bestScore > 0 ? best : null;
}

// Look up a per-vehicle-category adjustment by keyword (e.g. "truck", "suv").
export function parseVehicleAdjustment(adjustmentsJson, vehicleText) {
  if (!adjustmentsJson) return 0;
  let map;
  try { map = JSON.parse(adjustmentsJson); } catch { return 0; }
  if (!map || typeof map !== 'object') return 0;
  const words = new Set(tokens(vehicleText));
  for (const [keyword, amount] of Object.entries(map)) {
    if (words.has(String(keyword).toLowerCase())) return Number(amount) || 0;
  }
  return 0;
}

export function computeBaseline(entry, { vehicle } = {}) {
  const fees = Number(entry.fees) || 0;
  const adjustment = parseVehicleAdjustment(entry.vehicle_adjustments, vehicle);
  const low = round((Number(entry.labor_low) || 0) + (Number(entry.parts_low) || 0) + fees + adjustment);
  const high = round((Number(entry.labor_high) || 0) + (Number(entry.parts_high) || 0) + fees + adjustment);
  return { low, high, fees, adjustment };
}

export function computeConfidence({ hasEntry, comparables }) {
  if (hasEntry) return 'high';
  if (comparables >= 2) return 'medium';
  return 'low';
}

// Build a recommendation: deterministic baseline first, comparables as fallback.
export function recommend({ entries = [], comparables = [], service, vehicle }) {
  const entry = matchService(entries, service);
  const assumptions = [];
  const comparisons = comparables.slice(0, 5);

  if (entry) {
    const baseline = computeBaseline(entry, { vehicle });
    assumptions.push(`Based on price-book entry "${entry.service}".`);
    if (baseline.adjustment) assumptions.push(`Includes ${money(baseline.adjustment)} vehicle adjustment.`);
    return {
      matched: true,
      service: entry.service,
      low: baseline.low,
      high: baseline.high,
      confidence: computeConfidence({ hasEntry: true, comparables: comparisons.length }),
      assumptions,
      comparisons,
      baseline,
    };
  }

  if (comparisons.length) {
    const low = round(comparisons.reduce((s, c) => s + c.low, 0) / comparisons.length);
    const high = round(comparisons.reduce((s, c) => s + c.high, 0) / comparisons.length);
    assumptions.push(`No price-book entry; averaged ${comparisons.length} similar past job(s).`);
    return {
      matched: false,
      service,
      low,
      high,
      confidence: computeConfidence({ hasEntry: false, comparables: comparisons.length }),
      assumptions,
      comparisons,
    };
  }

  assumptions.push('No price-book entry and no comparable history — manual pricing needed.');
  return {
    matched: false,
    service,
    low: null,
    high: null,
    confidence: 'low',
    assumptions,
    comparisons: [],
  };
}

// Customer-facing estimate text. Explicitly, deliberately non-binding.
export function formatCustomerEstimate({ low, high, service }) {
  const svc = service ? ` for ${service}` : '';
  return (
    `Thanks! Based on what you described, our estimate${svc} is ${rangeText(low, high)}. ` +
    `This is an estimate only, not a final or binding quote — the final price may ` +
    `change after we inspect the vehicle in person.`
  );
}

// Private owner-facing recommendation with the approval command menu.
export function formatOwnerRecommendation(rec, { customerName } = {}) {
  const who = customerName ? ` for ${customerName}` : '';
  const lines = [];
  if (rec.low == null) {
    lines.push(`No price could be recommended${who} (${rec.service || 'unknown service'}).`);
  } else {
    lines.push(`Suggested estimate${who} (${rec.service || 'service'}): ${rangeText(rec.low, rec.high)} — confidence ${rec.confidence}.`);
  }
  if (rec.assumptions?.length) lines.push(`Assumptions: ${rec.assumptions.join(' ')}`);
  if (rec.comparisons?.length) {
    lines.push('Comparable past jobs: ' + rec.comparisons.map((c) => `${c.service} ${rangeText(c.low, c.high)}`).join('; '));
  }
  lines.push('');
  lines.push('Reply APPROVE to send this, EDIT <amount or range> to adjust, or NOQUOTE to send nothing.');
  return lines.join('\n');
}

export default {
  matchService, parseVehicleAdjustment, computeBaseline, computeConfidence,
  recommend, formatCustomerEstimate, formatOwnerRecommendation,
};
