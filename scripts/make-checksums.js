#!/usr/bin/env node
/**
 * Writes SHA256SUMS for a release (SEC6): one "<sha256>  <path>" line per
 * file the installers copy, in the format `sha256sum -c` / `shasum -a 256 -c`
 * read. Commit the result on the release tag only: install.sh/install.ps1
 * verify a download against it and refuse to install on any mismatch.
 *
 *   node scripts/make-checksums.js            # writes ./SHA256SUMS
 *   node scripts/make-checksums.js --stdout   # prints instead
 *
 * Scope: this catches a corrupted or partly downloaded copy. The sums come
 * from the same tag as the code, so they cannot protect against someone
 * who can rewrite the repository itself.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The same set package.json ships ("files"), plus package.json itself. */
export function releaseFiles(root = ROOT) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const out = ['package.json'];
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    if (fs.statSync(abs).isDirectory()) {
      for (const name of fs.readdirSync(abs).sort()) walk(path.posix.join(rel, name));
    } else {
      out.push(rel);
    }
  };
  for (const entry of pkg.files || []) walk(entry);
  return [...new Set(out)].sort();
}

export function checksumLines(root = ROOT, files = releaseFiles(root)) {
  return files.map((rel) => {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
    return `${hash}  ${rel}`;
  });
}

/** Paths whose content does not match SHA256SUMS in `root` (empty = all good). */
export function verifyChecksums(root) {
  const bad = [];
  for (const line of fs.readFileSync(path.join(root, 'SHA256SUMS'), 'utf8').split('\n')) {
    const m = line.match(/^([0-9a-f]{64}) {2}(.+)$/);
    if (!m) continue;
    const file = path.join(root, m[2]);
    const actual = fs.existsSync(file)
      ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
      : null;
    if (actual !== m[1]) bad.push(m[2]);
  }
  return bad;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = checksumLines().join('\n') + '\n';
  if (process.argv.includes('--stdout')) process.stdout.write(text);
  else {
    fs.writeFileSync(path.join(ROOT, 'SHA256SUMS'), text);
    console.log(`Wrote SHA256SUMS (${text.trim().split('\n').length} files)`);
  }
}
