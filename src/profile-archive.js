import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.js';

const execFileAsync = promisify(execFile);
const MAGIC = 'GV_PROFILE_ARCHIVE_V1';
const DEFAULT_EXCLUDES = [
  './Default/Cache',
  './Default/Code Cache',
  './Default/GPUCache',
  './Default/DawnCache',
  './Default/Service Worker/CacheStorage',
  './Default/Service Worker/ScriptCache',
  './GrShaderCache',
  './ShaderCache',
  './component_crx_cache',
  './extensions_crx_cache',
  './optimization_guide_model_store',
  './Safe Browsing',
  './OnDeviceHeadSuggestModel',
  './ZxcvbnData',
  './hyphen-data',
  './CertificateRevocation',
];

export function isDirectoryEmpty(dir) {
  if (!fs.existsSync(dir)) return true;
  return fs.readdirSync(dir).length === 0;
}

async function runTar(args) {
  await execFileAsync('tar', args, { windowsHide: true, maxBuffer: 1024 * 1024 });
}

function keyFromPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32);
}

function encryptBufferToFile({ buffer, archivePath, password }) {
  if (!password) throw new Error('GV_PROFILE_ARCHIVE_PASSWORD is required.');
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFromPassword(password, salt), iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const header = {
    magic: MAGIC,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
  fs.writeFileSync(archivePath, Buffer.concat([
    Buffer.from(`${JSON.stringify(header)}\n`, 'utf8'),
    ciphertext,
  ]));
}

function decryptFileToBuffer({ archivePath, password }) {
  const raw = fs.readFileSync(archivePath);
  const newline = raw.indexOf(0x0a);
  if (newline < 0) throw new Error('Invalid Google Voice profile archive.');
  const header = JSON.parse(raw.subarray(0, newline).toString('utf8'));
  if (header.magic !== MAGIC) throw new Error('Unsupported Google Voice profile archive.');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    keyFromPassword(password, Buffer.from(header.salt, 'base64')),
    Buffer.from(header.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(header.tag, 'base64'));
  return Buffer.concat([decipher.update(raw.subarray(newline + 1)), decipher.final()]);
}

export function encryptJsonFile({ value, archivePath, password }) {
  encryptBufferToFile({
    buffer: Buffer.from(JSON.stringify(value), 'utf8'),
    archivePath,
    password,
  });
  return { archivePath };
}

export function readEncryptedJsonFile({ archivePath, password }) {
  return JSON.parse(decryptFileToBuffer({ archivePath, password }).toString('utf8'));
}

export async function encryptDirectory({ sourceDir, archivePath, password, excludes = DEFAULT_EXCLUDES }) {
  if (!sourceDir || !fs.existsSync(sourceDir)) {
    throw new Error(`Profile source directory does not exist: ${sourceDir}`);
  }
  if (!password) throw new Error('GV_PROFILE_ARCHIVE_PASSWORD is required.');
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-profile-pack-'));
  const tarPath = path.join(tempRoot, 'profile.tar.gz');
  const excludeArgs = excludes.flatMap((pattern) => ['--exclude', pattern]);
  await runTar(['-czf', tarPath, ...excludeArgs, '-C', sourceDir, '.']);

  encryptBufferToFile({ buffer: fs.readFileSync(tarPath), archivePath, password });
  fs.rmSync(tempRoot, { recursive: true, force: true });
  return { archivePath };
}

function decryptArchiveToTar({ archivePath, password, tarPath }) {
  fs.writeFileSync(tarPath, decryptFileToBuffer({ archivePath, password }));
}

export async function restoreEncryptedProfile({ archivePath, targetDir, password }) {
  if (!archivePath || !password) return { restored: false, reason: 'missing_config' };
  if (!fs.existsSync(archivePath)) return { restored: false, reason: 'archive_missing' };
  if (!isDirectoryEmpty(targetDir)) return { restored: false, reason: 'target_not_empty' };

  fs.mkdirSync(targetDir, { recursive: true });
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-profile-restore-'));
  const tarPath = path.join(tempRoot, 'profile.tar.gz');
  try {
    decryptArchiveToTar({ archivePath, password, tarPath });
    await runTar(['-xzf', tarPath, '-C', targetDir]);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return { restored: true, reason: 'restored' };
}

export async function restoreProfileFromEnv(env = process.env, cfg = config) {
  return restoreEncryptedProfile({
    archivePath: env.GV_PROFILE_ARCHIVE_PATH || '',
    password: env.GV_PROFILE_ARCHIVE_PASSWORD || '',
    targetDir: cfg.browserProfilePath,
  });
}
