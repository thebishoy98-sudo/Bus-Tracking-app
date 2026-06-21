import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Validation + atomic storage for downloaded message attachments. Files are
// treated strictly as opaque bytes: we never execute, open, or interpret them.

export function validateAttachment({ mime, byteSize }, config) {
  if (!config.allowedImageMimes.includes(mime)) {
    return { ok: false, reason: `unsupported type ${mime || 'unknown'}` };
  }
  if (byteSize != null && byteSize > config.maxAttachmentBytes) {
    return { ok: false, reason: `file too large (${byteSize} > ${config.maxAttachmentBytes} bytes)` };
  }
  return { ok: true };
}

// Resolve a filename inside the media directory, refusing any path that would
// escape it (path traversal, absolute paths, etc.).
export function resolveMediaPath(config, name) {
  const base = path.resolve(config.mediaPath);
  const full = path.resolve(base, name);
  const rel = path.relative(base, full);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`invalid media path: "${name}" escapes the media directory`);
  }
  return full;
}

const EXT_FALLBACK = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

// Write the buffer atomically (temp file + rename) and return its location,
// size, and content hash. Re-validates the real byte length against the limit.
export async function storeAttachment({ buffer, mime, ext, messageId, index }, config) {
  const byteSize = buffer.length;
  const v = validateAttachment({ mime, byteSize }, config);
  if (!v.ok) throw new Error(v.reason);

  const safeExt = String(ext || EXT_FALLBACK[mime] || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  const fileName = `${messageId}-${index}.${safeExt}`;
  const full = resolveMediaPath(config, fileName);
  fs.mkdirSync(path.dirname(full), { recursive: true });

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const tmp = `${full}.${process.pid}.${index}.tmp`;
  await fs.promises.writeFile(tmp, buffer, { mode: 0o600 });
  await fs.promises.rename(tmp, full);

  return { filePath: full, sha256, byteSize };
}

export default { validateAttachment, storeAttachment, resolveMediaPath };
