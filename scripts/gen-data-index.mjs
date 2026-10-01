#!/usr/bin/env node
/**
 * Regenerates the per-directory overlay indexes the frontend uses to avoid
 * a 404 storm (Q2).
 *
 * The app ships a fixed set of per-category overlay files under
 * data/translations/<slug>.json and data/explanations/<slug>.json, but the
 * question bank (data/questions/<slug>.json) has 25 categories. If the client
 * probed every slug it would fire one 404 per missing overlay on every start.
 * Instead an index.json per directory lists exactly the overlays that exist;
 * state.js requests only those, and skips the rest entirely.
 *
 * The index is kept in sync in three places so it is always current:
 *   - server/index.js regenerates it at startup (before the first request);
 *   - scripts/build-static.js regenerates it into dist/ for the static build;
 *   - tests/data-index.test.js fails npm test if the committed file drifts.
 *
 * This module is the single source of truth for the index shape so all three
 * call sites agree. It is idempotent: re-running never changes a file whose
 * contents are already correct (so a server start on an unchanged tree does
 * not rewrite the file and dirty the working tree).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Lists the overlay basenames in a directory (sorted, *.json only, excluding
 * the index itself) and writes <dir>/index.json if it changed.
 *
 * @param {string} dir - absolute path to data/translations or data/explanations.
 * @returns {string[]} the sorted basenames written into the index.
 */
export function writeOverlayIndex(dir) {
  let names = [];
  if (fs.existsSync(dir)) {
    names = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.json') && e.name !== 'index.json')
      .map((e) => e.name)
      .sort();
  }
  const target = path.join(dir, 'index.json');
  const next = JSON.stringify(names) + '\n';
  let current = null;
  try {
    current = fs.readFileSync(target, 'utf8');
  } catch {
    /* no file yet */
  }
  if (current !== next) fs.writeFileSync(target, next);
  return names;
}

/**
 * Regenerates both overlay indexes under <root>/data.
 * @param {string} root - repo root.
 * @returns {{translations: string[], explanations: string[]}}
 */
export function regenerateIndexes(root = ROOT) {
  return {
    translations: writeOverlayIndex(path.join(root, 'data', 'translations')),
    explanations: writeOverlayIndex(path.join(root, 'data', 'explanations')),
  };
}

// Running this file directly (`node scripts/gen-data-index.mjs`) regenerates
// the committed indexes so `npm test` (and the smoke gate) stays green.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = regenerateIndexes();
  console.log(
    `index.json regenerated — translations: ${out.translations.length}, ` +
      `explanations: ${out.explanations.length}`,
  );
}
