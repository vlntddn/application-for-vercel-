#!/usr/bin/env node
/**
 * Writes public/.well-known/assetlinks.json, the file Chrome checks before
 * it lets the Android app render the site without a URL bar.
 *
 * Usage:
 *   node scripts/make-assetlinks.js <SHA256_FINGERPRINT> [packageName]
 *
 * The fingerprint comes from Play Console → Release → Setup → App signing
 * ("SHA-256 certificate fingerprint"). Use the key Play actually signs
 * with, not your upload key, or verification fails on installed builds.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [fingerprintArg, packageName = 'app.patentepro.twa'] = process.argv.slice(2);

if (!fingerprintArg) {
  console.error('usage: make-assetlinks.js <SHA256_FINGERPRINT> [packageName]');
  process.exit(2);
}

const fingerprint = fingerprintArg.trim().toUpperCase();
if (!/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(fingerprint)) {
  console.error(
    'That does not look like a SHA-256 fingerprint.\n' +
    'Expected 32 colon-separated hex pairs, e.g. AB:CD:...:12 — got:\n  ' + fingerprintArg,
  );
  process.exit(1);
}

const statement = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: packageName,
      sha256_cert_fingerprints: [fingerprint],
    },
  },
];

const dir = path.join(ROOT, 'public', '.well-known');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'assetlinks.json');
fs.writeFileSync(file, JSON.stringify(statement, null, 2) + '\n');

console.log(`Wrote ${path.relative(ROOT, file)}`);
console.log('Deploy, then confirm it is live:');
console.log('  curl https://<your-domain>/.well-known/assetlinks.json');
