#!/usr/bin/env node
/**
 * Assembles the static, backend-free build served by Vercel.
 *
 * The app normally runs against the local Node server; hosted statically
 * it keeps progress in the browser instead (public/js/local-progress.js).
 * Either way the frontend reads study content from the same /data/* and
 * /images/* URLs, so this script only has to arrange the files:
 *
 *   dist/            <- everything in public/
 *   dist/data/       <- the question bank, theory, lessons, dictionary
 *   dist/images/     <- sign images (data/images, flattened to /images)
 *
 * Deployment is Phase 3 work; local development stays build-free.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');

function copyDir(from, to, skip = () => false) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest, skip);
    else fs.copyFileSync(src, dest);
  }
}

function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
  }
  return n;
}

fs.rmSync(OUT, { recursive: true, force: true });

// 1. The frontend itself.
copyDir(path.join(ROOT, 'public'), OUT);

// 2. Study content. Images are served from /images, so they are copied
//    separately and left out of /data to avoid shipping them twice.
copyDir(path.join(ROOT, 'data'), path.join(OUT, 'data'), (name) => name === 'images');
copyDir(path.join(ROOT, 'data', 'images'), path.join(OUT, 'images'));

// 3. Stamp the standalone marker so the frontend keeps progress in the
//    browser instead of calling an API that does not exist here.
const indexPath = path.join(OUT, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('name="pp-mode"')) {
  fs.writeFileSync(
    indexPath,
    html.replace('</title>', '</title>\n  <meta name="pp-mode" content="standalone">'),
  );
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}

console.log(`Static build ready: ${countFiles(OUT)} files, ${mb(dirSize(OUT))} MB in dist/`);
