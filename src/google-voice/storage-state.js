import fs from 'node:fs';
import { readEncryptedJsonFile } from '../profile-archive.js';

export function readStorageStateFromEnv(env = process.env) {
  const archivePath = env.GV_STORAGE_STATE_PATH || '';
  const password = env.GV_STORAGE_STATE_PASSWORD || env.GV_PROFILE_ARCHIVE_PASSWORD || '';
  if (!archivePath || !password || !fs.existsSync(archivePath)) {
    return { loaded: false, reason: 'missing_config' };
  }
  const state = readEncryptedJsonFile({ archivePath, password });
  return { loaded: true, reason: 'loaded', state };
}

export async function applyStorageState(context, state) {
  const cookies = Array.isArray(state?.cookies) ? state.cookies : [];
  if (!cookies.length) return { applied: false, cookies: 0 };
  await context.addCookies(cookies);
  return { applied: true, cookies: cookies.length };
}
