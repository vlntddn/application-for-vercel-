#!/usr/bin/env node
/**
 * Q8 — owner proofread sampler for explanations.
 *
 * `node scripts/sample-explanations.mjs [N]` prints N random explanations
 * (default 40) as Markdown to /tmp/explanations-sample.md — id, the Italian
 * question, the bank verdict, and why in en/ru/zh. The output file lives OUT
 * of the repo (the owner reads it locally); only this script is committed.
 *
 * Why a random sample: a live audit found ~2 of 10 "why" texts carry
 * invented reasoning (a justification that is not in the question or the
 * lesson), so the owner reviews a fresh random slice each time instead of
 * the whole bank. Pair it with `node scripts/check-explanations.mjs`, whose
 * causal-word counter already lists the machine-suspicious ones.
 *
 * Args: N (how many, clamped to the bank size). Optional `--seed <n>` for a
 * reproducible draw (deterministic LCG shuffle — no Math.random by default).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const N = Math.max(1, parseInt(process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '40', 10));
const seedIdx = process.argv.indexOf('--seed');
const SEED = seedIdx >= 0 ? parseInt(process.argv[seedIdx + 1] || '1', 10) : 1;

/** Deterministic LCG — stable across Node versions, unlike Math.random. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const bankDir = path.join(ROOT, 'data', 'questions');
const exDir = path.join(ROOT, 'data', 'explanations');
const questions = new Map();
for (const f of fs.readdirSync(bankDir).filter((f) => f.endsWith('.json'))) {
  for (const q of JSON.parse(fs.readFileSync(path.join(bankDir, f), 'utf8'))) questions.set(q.id, q);
}
const items = []; // { id, entry }
for (const f of fs.readdirSync(exDir).filter((f) => f.endsWith('.json'))) {
  const file = JSON.parse(fs.readFileSync(path.join(exDir, f), 'utf8'));
  for (const [id, entry] of Object.entries((file && file.items) || {})) items.push({ id, entry });
}

const rand = lcg(SEED);
// Fisher–Yates on an index copy, then take the first N — O(n) and stable.
const order = items.map((_, i) => i);
for (let i = order.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [order[i], order[j]] = [order[j], order[i]];
}
const pick = order.slice(0, N).map((i) => items[i]);

const lines = [
  '# Explanations sample for owner proofread (Q8)',
  '',
  `Random sample of ${pick.length} of ${items.length} explanations (seed ${SEED}).`,
  'Look for invented reasoning — a "why" that justifies something the',
  'question / lesson never states. `node scripts/check-explanations.mjs`',
  'lists the machine-suspicious ones (causal words without support).',
  '',
  '---',
  '',
];
for (const { id, entry } of pick) {
  const q = questions.get(id);
  const why = (entry && entry.why) || {};
  lines.push(`## ${id}`);
  lines.push('');
  lines.push(`**${entry.verdict}**`);
  lines.push('');
  if (q && q.text_it) lines.push(`> ${q.text_it}`);
  lines.push('');
  if (why.en) lines.push(`- **en** — ${why.en}`);
  if (why.ru) lines.push(`- **ru** — ${why.ru}`);
  if (why.zh) lines.push(`- **zh** — ${why.zh}`);
  lines.push('');
  lines.push('---');
  lines.push('');
}
const out = '/tmp/explanations-sample.md';
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`Wrote ${pick.length} explanations to ${out} (seed ${SEED})`);
