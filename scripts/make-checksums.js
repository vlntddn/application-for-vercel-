#!/usr/bin/env node
/**
 * Regenerates SHA256SUMS at the repo root: sha256 over every tracked code
 * and config file (git ls-files), except the question bank under data/,
 * legacy/ and this table itself.
 *
 * Usage: node scripts/make-checksums.js   (writes ./SHA256SUMS)
 *
 * Installers verify the downloaded archive against the table of the SAME
 * tag or branch they are told to install; on a mismatch they abort.
 * Re-run this after any change and commit the result together with it.
 * Zero dependencies (node:crypto, node:fs, child_process for git ls-files).
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_PREFIXES = ['data/', 'legacy/'];
const SKIP_FILES = new Set(['SHA256SUMS']);

const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT })
  .toString()
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

const files = tracked.filter(
  (rel) => !SKIP_FILES.has(rel) && !SKIP_PREFIXES.some((p) => rel.startsWith(p)),
);

const lines = [
  '# SHA256SUMS — integrity check for the desktop installers (install.sh / install.ps1).',
  '# Regenerate with: node scripts/make-checksums.js   (commit the result with the change)',
  '# Paths are relative to the repository root. The installer verifies the archive it',
  '# downloads against the table of the SAME tag or branch it is told to install.',
];
for (const rel of files) {
  const hash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, rel)))
    .digest('hex');
  lines.push(`${hash}  ${rel}`);
}

const out = path.join(ROOT, 'SHA256SUMS');
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(`Wrote SHA256SUMS (${files.length} files)`);
