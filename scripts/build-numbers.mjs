#!/usr/bin/env node
/**
 * L4 — «Числа, которые надо знать».
 *
 * Collects the `mustKnow` rows that contain numbers from data/lessons.json,
 * extracts the numeric tokens (speeds, distances, times, ages, points,
 * decimals with a comma) and counts how many exam questions in the bank
 * actually contain each token (FALSO / VERO split — the same 50/50 idea as
 * the L1c signal drill). Writes data/insights/numbers.json.
 *
 * Node 18+, no dependencies. Usage: node scripts/build-numbers.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadQuestions } from './build-insights.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lessons = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'lessons.json'), 'utf8'),
);
const questions = loadQuestions();

// A number token: digits, optional decimal with a comma or a dot
// (Italian "0,5 g/l") and an optional time part "8:00". No letter before
// the first digit ("AM 14" → 14, but a license letter never counts as a
// digit run) and no digit right after ("150" does not match inside "1500").
const TOKEN = /(?<![A-Za-z0-9])(\d+(?:[.,]\d+)?(?::\d{2})?)/g;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tokenRe = (t) => new RegExp(`(^|[^0-9])${escapeRe(t)}([^0-9]|$)`);

// One row per mustKnow value that carries at least one number.
const table = [];
const tokenSet = new Set();
for (const [chapterId, ch] of Object.entries(lessons.chapters)) {
  for (const mk of ch.mustKnow || []) {
    const value = mk.value || '';
    const tokens = [...new Set([...value.matchAll(TOKEN)].map((m) => m[1]))];
    if (!tokens.length) continue;
    tokens.forEach((t) => tokenSet.add(t));
    table.push({
      chapter: chapterId,
      fact: mk.fact_it || '',
      value,
      tokens,
    });
  }
}

// Per-token bank stats: how many questions mention the number, split by
// answer — that is what powers the 50/50 drill.
const stats = new Map();
for (const t of tokenSet) {
  let falseCount = 0;
  let trueCount = 0;
  const re = tokenRe(t);
  for (const q of questions) {
    if (!re.test(q.text_it)) continue;
    if (q.is_true) trueCount += 1;
    else falseCount += 1;
  }
  stats.set(t, { false: falseCount, true: trueCount, total: falseCount + trueCount });
}

// Per-chapter row: how many questions of that chapter's category contain
// any of the row's numbers (the roadmap's «по каждой главе число вопросов
// банка с этими числами»).
const mod = await import(path.join(ROOT, 'public', 'js', 'theory-map.js'));
const chapterSlug = (chapterId) => mod.CHAPTER_CATEGORY[chapterId] || '';
for (const row of table) {
  const slug = chapterSlug(row.chapter);
  const res = row.tokens.map(tokenRe);
  row.questions = questions.filter(
    (q) => slug && q.id.startsWith(`${slug}-`) && res.some((r) => r.test(q.text_it)),
  ).length;
}

// Deterministic: generatedAt changes only when the real content changed,
// so the committed file is byte-reproducible («файл = скрипт» test).
const content = { table, tokens: [] };
content.tokens = [...tokenSet]
  .map((t) => ({ token: t, ...stats.get(t) }))
  .sort((a, b) => a.token.localeCompare(b.token, undefined, { numeric: true }));
const hash = crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16);
let generatedAt = null;
const outPath = path.join(ROOT, 'data', 'insights', 'numbers.json');
if (fs.existsSync(outPath)) {
  try {
    const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    if (prev.contentHash === hash) generatedAt = prev.generatedAt;
  } catch { /* first build or unreadable — regenerate the stamp */ }
}
if (!generatedAt) generatedAt = new Date().toISOString();

const out = {
  generatedAt,
  contentHash: hash,
  bank: questions.length,
  table,
  tokens: content.tokens,
};
fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
const drillable = out.tokens
  .filter((t) => t.false > 0 && t.true > 0)
  .reduce((n, t) => n + t.total, 0);
console.log(
  `numbers.json: ${table.length} строк, ${out.tokens.length} чисел, ` +
    `банковских вопросов с числами: ${out.tokens.reduce((n, t) => n + t.total, 0)} ` +
    `(в 50/50-тренажёре — ${drillable})`,
);
