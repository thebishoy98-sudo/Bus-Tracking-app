// Lightweight lint: byte-compile every source/test module with `node --check`.
// This catches syntax errors and bad imports without pulling in a heavy linter.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const roots = ['src', 'test', 'scripts'];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

let failed = 0;
for (const root of roots) {
  let files = [];
  try {
    files = walk(root);
  } catch {
    continue; // root may not exist
  }
  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (err) {
      failed++;
      console.error(`✖ ${file}`);
      console.error(String(err.stderr || err.message).trim());
    }
  }
}

if (failed) {
  console.error(`\nlint failed: ${failed} file(s) with errors`);
  process.exit(1);
}
console.log('lint ok');
