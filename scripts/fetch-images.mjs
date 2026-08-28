#!/usr/bin/env node
/**
 * Downloads all external question images into data/images/ and rewrites
 * image_url in data/questions/*.json to local /images/<file> paths.
 *
 * Idempotent: already-downloaded files are skipped, already-local URLs
 * are left untouched. Run with:  npm run fetch-images
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUESTIONS_DIR = path.join(ROOT, 'data', 'questions');
const IMAGES_DIR = path.join(ROOT, 'data', 'images');
const CONCURRENCY = 8;
const RETRIES = 3;

fs.mkdirSync(IMAGES_DIR, { recursive: true });

// ---- 1. Collect unique remote URLs and check for basename collisions ----

const files = fs.readdirSync(QUESTIONS_DIR).filter((f) => f.endsWith('.json'));
const urlToLocal = new Map();

for (const file of files) {
  const questions = JSON.parse(fs.readFileSync(path.join(QUESTIONS_DIR, file), 'utf8'));
  for (const q of questions) {
    if (q.image_url && /^https?:\/\//.test(q.image_url)) {
      urlToLocal.set(q.image_url, null);
    }
  }
}

const seenNames = new Map(); // basename -> url (collision detection)
for (const url of urlToLocal.keys()) {
  const base = path.basename(new URL(url).pathname);
  if (!/^[\w.-]+$/.test(base)) {
    throw new Error(`Unsafe image filename in URL: ${url}`);
  }
  const existing = seenNames.get(base);
  if (existing && existing !== url) {
    throw new Error(`Basename collision: ${existing} vs ${url} — extend naming scheme`);
  }
  seenNames.set(base, url);
  urlToLocal.set(url, base);
}

console.log(`Found ${urlToLocal.size} unique remote images across ${files.length} topic files.`);

// ---- 2. Download (with retries), skipping files that already exist ----

async function download(url, dest) {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length === 0) throw new Error('empty response');
      await fsp.writeFile(dest, bytes);
      return 'downloaded';
    } catch (err) {
      if (attempt === RETRIES) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

const tasks = [...urlToLocal.entries()];
let downloaded = 0;
let skipped = 0;
const failed = [];

async function worker() {
  while (tasks.length) {
    const [url, name] = tasks.pop();
    const dest = path.join(IMAGES_DIR, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      skipped++;
      continue;
    }
    try {
      await download(url, dest);
      downloaded++;
      if (downloaded % 50 === 0) console.log(`  ...${downloaded} downloaded`);
    } catch (err) {
      failed.push(url);
      console.error(`  FAILED: ${err.message}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`Downloaded ${downloaded}, already present ${skipped}, failed ${failed.length}.`);

if (failed.length) {
  console.error('Some downloads failed — URLs were NOT rewritten for those images. Re-run to retry.');
}

// ---- 3. Rewrite question JSONs to local paths (only for fetched files) ----

let rewritten = 0;
for (const file of files) {
  const filePath = path.join(QUESTIONS_DIR, file);
  const questions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let changed = false;
  for (const q of questions) {
    if (!q.image_url || !/^https?:\/\//.test(q.image_url)) continue;
    const name = urlToLocal.get(q.image_url);
    if (failed.includes(q.image_url)) continue;
    if (fs.existsSync(path.join(IMAGES_DIR, name))) {
      q.image_url = `/images/${name}`;
      changed = true;
      rewritten++;
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(questions, null, 2) + '\n');
  }
}

console.log(`Rewrote image_url on ${rewritten} questions.`);
process.exit(failed.length ? 1 : 0);
