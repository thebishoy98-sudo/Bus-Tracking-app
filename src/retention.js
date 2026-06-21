import fs from 'node:fs';
import path from 'node:path';

// Media + diagnostics retention. Database-driven and strictly contained: it
// never unlinks anything outside the configured media/diagnostics directories.

// Parse a SQLite "YYYY-MM-DD HH:MM:SS" (UTC) or ISO timestamp to epoch ms.
function parseTs(ts) {
  if (!ts) return 0;
  const iso = ts.includes('T') ? ts : `${ts.replace(' ', 'T')}Z`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

// True only if `file` resolves to a path inside `base`.
function within(base, file) {
  if (!base || !file) return false;
  const b = path.resolve(base);
  const f = path.resolve(file);
  const rel = path.relative(b, f);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function sweepDir(dir, cutoffMs, referenced) {
  let removed = 0;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    if (!e.isFile()) continue;
    const full = path.resolve(dir, e.name);
    if (referenced.has(full)) continue; // never delete a referenced file
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (st.mtimeMs < cutoffMs) {
      try { fs.rmSync(full, { force: true }); removed++; } catch { /* ignore */ }
    }
  }
  return removed;
}

export function runRetention({ store, config, now = new Date().toISOString() }) {
  const days = config.mediaRetentionDays || 90;
  const cutoffMs = Date.parse(now) - days * 86400000;
  const result = { deletedAttachments: 0, sweptFiles: 0, deletedScreenshots: 0, skippedOutside: 0 };

  // Phase A — expire attachment rows older than the cutoff.
  for (const att of store.getAllAttachments()) {
    if (parseTs(att.created_at) >= cutoffMs) continue; // still within retention
    if (att.file_path) {
      if (within(config.mediaPath, att.file_path)) {
        try { fs.rmSync(att.file_path, { force: true }); } catch { /* ignore */ }
      } else {
        result.skippedOutside++; // safety: leave external files untouched
      }
    }
    store.deleteAttachment(att.id);
    result.deletedAttachments++;
  }

  // Files still referenced by remaining attachment rows are preserved.
  const referenced = new Set(
    store.getAllAttachments()
      .map((a) => (a.file_path ? path.resolve(a.file_path) : null))
      .filter(Boolean),
  );

  // Phase B — sweep orphaned media files older than the cutoff.
  result.sweptFiles = sweepDir(config.mediaPath, cutoffMs, referenced);

  // Phase C — clean old diagnostic screenshots (none are referenced).
  result.deletedScreenshots = sweepDir(config.diagnosticsPath, cutoffMs, new Set());

  const summary = `attachments:${result.deletedAttachments} swept:${result.sweptFiles} screenshots:${result.deletedScreenshots} skippedOutside:${result.skippedOutside}`;
  store.setHealthMany({ last_retention_at: now, last_retention_result: summary });
  return { ...result, summary };
}

export default { runRetention };
