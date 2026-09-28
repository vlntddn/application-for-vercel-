import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Phase 2.1 — bank translation consistency audit.
 *
 * Runs on every `npm test` and checks the frozen bank (data/questions/*)
 * against the translation-quality criteria in docs/TODO.md:
 *   1. every question has a non-empty `text` in each active language;
 *   2. translation lengths stay within per-language bounds;
 *   3. no translation is a verbatim copy of the Italian original;
 *   4. data/manifest.json counts stay in sync with the question files;
 *   5. overlay files (data/translations/*) are valid JSON, reference only
 *      existing question ids, and their `text` values respect the same
 *      length bounds.
 *
 * The audit reports every violation (not just the first) so a single red
 * run is actionable without re-running.
 */

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const QUESTIONS_DIR = path.join(ROOT, 'data', 'questions');
const OVERLAYS_DIR = path.join(ROOT, 'data', 'translations');

// Active UI languages (Settings offers exactly these three).
const ACTIVE_LANGS = ['en', 'ru', 'zh'];

// Upper bound for every language: a translation longer than this is a
// pasted paragraph, not a question.
const MAX_LEN = 400;

// Lower bounds are calibrated to the shortest LEGITIMATE full translation
// in the bank (measured 2026-09-28): en's shortest is exactly 20 chars;
// ru has one complete 17-char translation ("Автобус не машина"), so the
// ru floor is 15; Chinese is high-density — its shortest complete
// translation is 6 characters ("车道是停车场") — so the zh floor is 6.
// Anything below these floors is a truncated/broken fragment.
const MIN_LEN = { en: 20, ru: 15, zh: 6 };

/** Loads every question from the bank, tagged with its category slug. */
function loadBank() {
  const categories = fs
    .readdirSync(QUESTIONS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const byCategory = new Map();
  const all = [];
  for (const file of categories) {
    const slug = file.slice(0, -5);
    const questions = JSON.parse(fs.readFileSync(path.join(QUESTIONS_DIR, file), 'utf8'));
    if (!Array.isArray(questions)) throw new Error(`bank file ${file} is not an array`);
    byCategory.set(slug, questions.length);
    for (const q of questions) all.push({ slug, q });
  }
  return { byCategory, all };
}

/** First `cap` items of a list, one per line, with a trailing "N more". */
function sample(items, cap = 20) {
  const shown = items.slice(0, cap).join('\n  ');
  const rest = items.length - Math.min(items.length, cap);
  return rest > 0 ? shown + `\n  … and ${rest} more` : shown;
}

const { byCategory, all } = loadBank();

test('bank has questions for every category in data/manifest.json', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'manifest.json'), 'utf8'));
  const mismatches = [];
  for (const cat of manifest.categories) {
    const actual = byCategory.get(cat.slug);
    if (actual === undefined) {
      mismatches.push(`${cat.slug}: in manifest (${cat.count}) but file missing`);
    } else if (actual !== cat.count) {
      mismatches.push(`${cat.slug}: manifest says ${cat.count}, file has ${actual}`);
    }
  }
  assert.equal(
    manifest.totalQuestions,
    all.length,
    `manifest.totalQuestions=${manifest.totalQuestions} but bank has ${all.length}\n  ${sample(mismatches)}`
  );
  assert.ok(
    mismatches.length === 0,
    'manifest counts out of sync:\n  ' + sample(mismatches)
  );
});

test('every question has a non-empty translation in all active languages', () => {
  const missing = [];
  for (const { slug, q } of all) {
    if (!q.id || typeof q.id !== 'string') {
      missing.push(`${slug}: question without an id`);
      continue;
    }
    const translations = q.translations;
    for (const lang of ACTIVE_LANGS) {
      const text =
        translations && typeof translations[lang] === 'object' && translations[lang] !== null
          ? translations[lang].text
          : undefined;
      if (typeof text !== 'string' || text.trim() === '') {
        missing.push(`${q.id} [${lang}]`);
      }
    }
  }
  assert.ok(
    missing.length === 0,
    `${missing.length} missing translations:\n  ${sample(missing)}`
  );
});

test('translation lengths stay within per-language bounds', () => {
  const violations = [];
  for (const { slug, q } of all) {
    const translations = q.translations || {};
    for (const lang of ACTIVE_LANGS) {
      const text = (translations[lang] || {}).text;
      if (typeof text !== 'string' || text.trim() === '') continue; // reported by the completeness test
      const len = text.trim().length;
      const min = MIN_LEN[lang];
      if (len < min) violations.push(`${q.id} [${lang}] too short (${len} < ${min}): "${text}"`);
      if (len > MAX_LEN) violations.push(`${q.id} [${lang}] too long (${len} > ${MAX_LEN})`);
    }
  }
  assert.ok(
    violations.length === 0,
    `${violations.length} out-of-bounds translations:\n  ${sample(violations)}`
  );
});

test('no translation is a verbatim copy of the Italian original', () => {
  const dups = [];
  for (const { slug, q } of all) {
    const it = (q.text_it || '').trim();
    if (it === '') continue;
    const translations = q.translations || {};
    for (const lang of ACTIVE_LANGS) {
      const text = (translations[lang] || {}).text;
      if (typeof text === 'string' && text.trim() === it) {
        dups.push(`${q.id} [${lang}] duplicates text_it`);
      }
    }
  }
  assert.ok(dups.length === 0, `${dups.length} untranslated duplicates:\n  ${sample(dups)}`);
});

test('overlay files are valid, reference real questions, and respect length bounds', () => {
  if (!fs.existsSync(OVERLAYS_DIR)) return; // no overlays yet — nothing to audit
  const knownIds = new Set(all.map(({ q }) => q.id));
  const violations = [];
  const files = fs.readdirSync(OVERLAYS_DIR).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    let overlay;
    try {
      overlay = JSON.parse(fs.readFileSync(path.join(OVERLAYS_DIR, file), 'utf8'));
    } catch (err) {
      violations.push(`${file}: invalid JSON (${err.message})`);
      continue;
    }
    const entries = overlay.translations;
    if (entries === undefined) continue; // file without a translations section is a no-op by design
    if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) {
      violations.push(`${file}: "translations" must be an object`);
      continue;
    }
    for (const [id, entry] of Object.entries(entries)) {
      if (!knownIds.has(id)) {
        violations.push(`${file}: unknown question id "${id}"`);
        continue;
      }
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        violations.push(`${file}[${id}]: entry must be an object`);
        continue;
      }
      for (const [lang, value] of Object.entries(entry)) {
        if (lang === 'it') {
          violations.push(`${file}[${id}]: overlays must not carry the source language "it"`);
          continue;
        }
        if (typeof value !== 'object' || value === null || typeof value.text !== 'string') {
          violations.push(`${file}[${id}][${lang}]: must carry a string "text"`);
          continue;
        }
        const len = value.text.trim().length;
        const min = Object.prototype.hasOwnProperty.call(MIN_LEN, lang) ? MIN_LEN[lang] : 0;
        if (len < min) violations.push(`${file}[${id}][${lang}] too short (${len} < ${min})`);
        if (len > MAX_LEN) violations.push(`${file}[${id}][${lang}] too long (${len} > ${MAX_LEN})`);
      }
    }
  }
  assert.ok(
    violations.length === 0,
    `${violations.length} overlay problem(s):\n  ${sample(violations)}`
  );
});
