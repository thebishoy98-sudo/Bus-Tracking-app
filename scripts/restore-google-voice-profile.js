import { restoreProfileFromEnv } from '../src/profile-archive.js';

try {
  const result = await restoreProfileFromEnv();
  console.log(JSON.stringify(result));
} catch (err) {
  console.error(`Failed to restore Google Voice profile: ${err.message}`);
  process.exit(1);
}
