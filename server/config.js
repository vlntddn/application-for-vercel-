import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Loads KEY=VALUE pairs from a .env file into process.env without
 * overriding variables that are already set. Secrets and machine-local
 * settings live only in the environment / .env file, never in source
 * code and never in the frontend.
 */
function loadDotEnv(file = path.join(ROOT, '.env')) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return; // .env is optional
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

export const config = {
  root: ROOT,
  host: process.env.HOST || '127.0.0.1',
  port: Number.parseInt(process.env.PORT || '3000', 10),
  dataDir: path.join(ROOT, 'data'),
  storageDir: path.resolve(ROOT, process.env.STORAGE_DIR || 'storage'),
  publicDir: path.join(ROOT, 'public'),
  maxBodyBytes: 256 * 1024,
  // A full progress backup is ~1 MB at 7139 answers, so the import route
  // gets its own, larger ceiling.
  maxImportBytes: 8 * 1024 * 1024,
};

if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}
