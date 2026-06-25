import { encryptDirectory } from '../src/profile-archive.js';
import { config } from '../src/config.js';

const sourceDir = process.env.GV_PROFILE_ARCHIVE_SOURCE || config.browserProfilePath;
const archivePath = process.env.GV_PROFILE_ARCHIVE_PATH || './secrets/gv-profile.tar.gz.enc';
const password = process.env.GV_PROFILE_ARCHIVE_PASSWORD || '';

try {
  const result = await encryptDirectory({ sourceDir, archivePath, password });
  console.log(`Encrypted Google Voice profile archive written to ${result.archivePath}`);
} catch (err) {
  console.error(`Failed to archive Google Voice profile: ${err.message}`);
  process.exit(1);
}
