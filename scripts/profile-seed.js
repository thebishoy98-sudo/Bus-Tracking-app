import fs from 'node:fs';
import path from 'node:path';

export function buildChromeArgs(profilePath) {
  return [
    `--user-data-dir=${profilePath}`,
    '--no-first-run',
    '--new-window',
    'https://voice.google.com/messages',
  ];
}

export function resolveProfilePath(profilePath, cwd = process.cwd()) {
  return path.resolve(cwd, profilePath);
}

export function findStableChrome({ env = process.env, platform = process.platform } = {}) {
  const candidates = env.GV_CHROME_PATH ? [env.GV_CHROME_PATH] : platform === 'win32'
    ? [
        path.join(env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ]
    : platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];

  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || '';
}
