/**
 * Offline explanations gate (L9a).
 *
 * Explanations are authored OFFLINE (the app never calls an AI — no network,
 * strict CSP, privacy) and stored in data/explanations/<category>.json:
 *   { "category": "<slug>", "items": { "<questionId>": {
 *        "verdict": "VERO" | "FALSO",
 *        "key_it": "<verbatim phrase from text_it>",
 *        "chapter": "chN",
 *        "why": { "en": "...", "ru": "...", "zh": "..." },
 *        "source": "ai-draft", "model": "<name>", "at": "<date>" } } }
 *
 * Rules enforced (any violation = error, nothing may be invented):
 *   1. verdict matches the question's is_true (VERO for true, FALSO for false);
 *   2. key_it is a non-empty substring of text_it (verbatim);
 *   3. chapter is the CATEGORY_CHAPTER of the question's topic slug;
 *   4. every number that appears in any why language occurs in text_it or in
 *      this chapter's mustKnow — you cannot invent numbers;
 *   5. why has all three languages, each ≤ 280 chars, and none duplicates
 *      text_it;
 *   6. the question id exists in the read-only bank.
 *
 * Pure and deterministic: read-only, imports the presentation-level
 * chapter map so there is a single source of truth for topic → chapter.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CATEGORY_CHAPTER } from '../public/js/theory-map.js';

export const WHY_LANGS = ['en', 'ru', 'zh'];
export const WHY_MAX_LEN = 280;

/**
 * Read the whole read-only question bank into a Map<id, question>. Each
 * question is stamped with `slug` (its source file name) so the chapter
 * check can resolve CATEGORY_CHAPTER without re-parsing the manifest.
 */
export function loadQuestionBank(root) {
  const dir = path.join(root, 'data', 'questions');
  const byId = new Map();
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const slug = f.replace(/\.json$/, '');
    for (const q of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) {
      q.slug = slug;
      byId.set(q.id, q);
    }
  }
  return byId;
}

/** Read data/lessons.json → the chapters object keyed by chapter id. */
export function loadChapters(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'data', 'lessons.json'), 'utf8')).chapters;
}

/** Every distinct number token in a string, as a Set of integers. */
export function extractNumbers(str) {
  const out = new Set();
  const re = /\d+(?:[.,]\d+)?/g;
  let m;
  while ((m = re.exec(String(str))) !== null) out.add(Number(m[0].replace(',', '.')));
  return out;
}

/** Numbers that this chapter's mustKnow facts legitimately state. */
export function mustKnowNumbers(chapter) {
  const nums = new Set();
  if (!chapter || !Array.isArray(chapter.mustKnow)) return nums;
  for (const fact of chapter.mustKnow) {
    for (const piece of [fact.fact_it, fact.value, fact.note && fact.note.en, fact.note && fact.note.ru, fact.note && fact.note.zh]) {
      if (typeof piece === 'string') for (const n of extractNumbers(piece)) nums.add(n);
    }
  }
  return nums;
}

/**
 * Validate one explanation entry against its question. Returns a list of
 * human-readable error strings (empty = OK). `chapters` is the lessons
 * chapters object used to back-check numbers against mustKnow.
 */
export function validateExplanation(entry, question, chapters) {
  const errors = [];
  const id = question.id;
  const textIt = question.text_it || '';

  // (6) id exists — caller guarantees the question, but keep the contract.
  if (!question) return [`unknown question id "${id}"`];

  // (1) verdict matches is_true.
  const wantVerdict = question.is_true ? 'VERO' : 'FALSO';
  if (entry.verdict !== wantVerdict) {
    errors.push(`${id}: verdict "${entry.verdict}" != ${wantVerdict} (is_true=${question.is_true})`);
  }

  // (2) key_it is a verbatim substring of text_it.
  if (typeof entry.key_it !== 'string' || entry.key_it.trim() === '' || !textIt.includes(entry.key_it)) {
    errors.push(`${id}: key_it is not a verbatim substring of text_it`);
  }

  // (3) chapter = CATEGORY_CHAPTER of the topic slug.
  const wantChapter = question.slug ? CATEGORY_CHAPTER[question.slug] : null;
  if (!wantChapter) {
    errors.push(`${id}: no chapter mapped for topic "${question.slug}"`);
  } else if (entry.chapter !== wantChapter) {
    errors.push(`${id}: chapter "${entry.chapter}" != ${wantChapter} for topic "${question.slug}"`);
  }

  // (4) numbers in why must come from text_it or this chapter's mustKnow.
  const allowed = new Set(extractNumbers(textIt));
  for (const n of mustKnowNumbers(chapters && chapters[wantChapter])) allowed.add(n);
  const why = entry.why || {};
  for (const lang of WHY_LANGS) {
    for (const n of extractNumbers(why[lang] || '')) {
      if (!allowed.has(n)) errors.push(`${id}: invented number ${n} in why.${lang} (not in text_it or ${wantChapter} mustKnow)`);
    }
  }

  // (5) all three languages, ≤ 280 chars each, none a duplicate of text_it.
  for (const lang of WHY_LANGS) {
    const w = why[lang];
    if (typeof w !== 'string' || w.trim() === '') {
      errors.push(`${id}: why.${lang} missing or empty`);
    } else {
      if (w.length > WHY_MAX_LEN) errors.push(`${id}: why.${lang} is ${w.length} chars (> ${WHY_MAX_LEN})`);
      if (w.trim() === textIt.trim()) errors.push(`${id}: why.${lang} duplicates text_it`);
    }
  }

  return errors;
}

/**
 * Validate one data/explanations/<file>. Validate every item in `file.items`
 * against the bank. Returns [{ id, errors: [...] }] for failing entries.
 * Also flags ids in the file that are not in the bank (rule 6).
 */
export function validateFile(file, bank, chapters) {
  const problems = [];
  const items = file && file.items ? file.items : {};
  for (const [id, entry] of Object.entries(items)) {
    const question = bank.get(id);
    if (!question) {
      problems.push({ id, errors: [`id "${id}" is not in the question bank`] });
      continue;
    }
    const errors = validateExplanation(entry, question, chapters);
    if (errors.length) problems.push({ id, errors });
  }
  return problems;
}

/**
 * Validate every file in data/explanations/. Slugs each item's question so
 * the chapter check works. Returns a flat list of error strings.
 */
export function checkAll(root) {
  const bank = loadQuestionBank(root);
  const chapters = loadChapters(root);
  const exDir = path.join(root, 'data', 'explanations');
  const allErrors = [];
  if (!fs.existsSync(exDir)) return allErrors; // nothing to check yet (L9b adds the first files)
  for (const f of fs.readdirSync(exDir).filter((f) => f.endsWith('.json'))) {
    const file = JSON.parse(fs.readFileSync(path.join(exDir, f), 'utf8'));
    for (const { id, errors } of validateFile(file, bank, chapters)) allErrors.push(...errors);
  }
  return allErrors;
}
