import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  shuffled,
  queueOrder,
  masteryOf,
  categoryStats,
  introQueue,
  INTRO_QUESTIONS,
  INTRO_TEXT_LEN,
} from '../public/js/domain/learning.js';

const manifest = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, '..', 'data', 'manifest.json'), 'utf8'),
);

/** Deterministic PRNG (mulberry32) — stable order across runs/Node versions. */
function rand32(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const q = (id, extra = {}) => ({ id, text_it: 'test', ...extra });
const seen = (lastCorrect, correct = 1, wrong = 0) => ({ correct, wrong, lastCorrect });

test('queueOrder: unseen first, then current mistakes, then the rest', () => {
  const questions = [q('t-1'), q('t-2'), q('t-3'), q('t-4'), q('t-5'), q('t-6')];
  const answers = {
    't-1': seen(true),
    't-2': seen(false, 0, 1),
    't-3': seen(true, 2, 1),
  };
  const order = queueOrder(questions, answers, 20, rand32());
  assert.deepEqual(new Set(order.slice(0, 3).map((x) => x.id)), new Set(['t-4', 't-5', 't-6']));
  assert.deepEqual(new Set(order.slice(3, 4).map((x) => x.id)), new Set(['t-2']));
  assert.deepEqual(new Set(order.slice(4).map((x) => x.id)), new Set(['t-1', 't-3']));
  assert.equal(order.length, 6);
});

test('queueOrder respects count and never duplicates', () => {
  const questions = [q('t-1'), q('t-2'), q('t-3'), q('t-4')];
  const order = queueOrder(questions, {}, 2, rand32());
  assert.equal(order.length, 2);
  assert.equal(new Set(order).size, 2);
});

test('queueOrder is deterministic with an injected rand', () => {
  const questions = Array.from({ length: 50 }, (_, i) => q(`t-${i}`));
  const answers = { 't-7': seen(false, 0, 1), 't-11': seen(true) };
  const a = queueOrder(questions, answers, 20, rand32(7));
  const b = queueOrder(questions, answers, 20, rand32(7));
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
});

test('masteryOf counts only ids of its own slug (segnali ≠ segnali-divieto)', () => {
  const answers = {
    'segnali-pericolo-1': seen(true),
    'segnali-pericolo-2': seen(false, 0, 1),
    'segnali-divieto-1': seen(true),
  };
  assert.deepEqual(masteryOf(answers, 'segnali-pericolo', 3), { mastered: 1, pct: 33 });
  assert.deepEqual(masteryOf(answers, 'segnali-divieto', 2), { mastered: 1, pct: 50 });
});

test('masteryOf: every slug in the manifest counts only its own ids', () => {
  // Answer every id of every topic last-correct: each topic must report
  // exactly its manifest count, proving no slug bleeds into a neighbor.
  const answers = {};
  const perSlug = {};
  for (const cat of manifest.categories) {
    for (let i = 1; i <= cat.count; i += 1) {
      const id = `${cat.slug}-${i}`;
      answers[id] = seen(true);
      perSlug[cat.slug] = perSlug[cat.slug] ?? 0;
      perSlug[cat.slug] += 1;
    }
  }
  for (const cat of manifest.categories) {
    const { mastered, pct } = masteryOf(answers, cat.slug, cat.count);
    assert.equal(mastered, perSlug[cat.slug], `slug ${cat.slug} counted foreign ids`);
    assert.equal(pct, 100);
  }
});

test('categoryStats: attempted/mastered/accuracy per topic, null accuracy when untouched', () => {
  const categories = [
    { slug: 'segnali', name: 'Segnali', count: 3 },
    { slug: 'limiti', name: 'Limiti', count: 10 },
  ];
  const answers = {
    'segnali-1': seen(true),
    'segnali-2': { correct: 1, wrong: 1, lastCorrect: false },
    'limiti-5': seen(true),
  };
  const stats = categoryStats(answers, categories);
  assert.deepEqual(stats[0], {
    slug: 'segnali', name: 'Segnali', count: 3,
    attempted: 2, mastered: 1, masteredPct: 33, accuracy: 67,
  });
  assert.deepEqual(stats[1], {
    slug: 'limiti', name: 'Limiti', count: 10,
    attempted: 1, mastered: 1, masteredPct: 10, accuracy: 100,
  });
  const empty = categoryStats({}, [{ slug: 'x', name: 'X', count: 4 }])[0];
  assert.equal(empty.accuracy, null);
  assert.equal(empty.masteredPct, 0);
});

test('introQueue: easiest unseen questions first, remainder keeps queue order', () => {
  const short = (n) => 'a'.repeat(n);
  const questions = [
    q('s-1', { text_it: short(30) }),
    q('s-2', { text_it: short(40) }),
    q('s-3', { text_it: short(50) }),
    q('s-4', { text_it: short(60) }),
    q('s-5', { text_it: short(70) }),
    q('s-6', { text_it: short(80) }),
    q('s-7', { text_it: 'long'.repeat(40) }),
    q('s-8', { text_it: short(20), image_url: '/img/sign.png' }),
    q('s-9', { text_it: 'z'.repeat(200) }),
  ];
  const answers = { 's-1': seen(true) }; // s-1 no longer "unseen"
  const order = introQueue(questions, { answers, batch: 20 });
  assert.equal(order.length, 9);
  // Exactly 5 easy unseen (≤120 chars, no image): s-2..s-6
  assert.deepEqual(new Set(order.slice(0, 5).map((x) => x.id)),
    new Set(['s-2', 's-3', 's-4', 's-5', 's-6']));
  assert.deepEqual(new Set(order.slice(5).map((x) => x.id)),
    new Set(['s-1', 's-7', 's-8', 's-9']));
});

test('introQueue: null when fewer than count easy questions exist', () => {
  const questions = [q('s-1', { text_it: 'a'.repeat(10) }), q('s-2', { text_it: 'b'.repeat(200) })];
  assert.equal(introQueue(questions, { answers: {} }), null);
});

test('introQueue honors custom count/textLen and skips already-answered questions', () => {
  const questions = [
    q('s-1', { text_it: 'a'.repeat(10) }),
    q('s-2', { text_it: 'b'.repeat(20) }),
    q('s-3', { text_it: 'c'.repeat(20) }),
    q('s-4', { text_it: 'd'.repeat(30) }),
  ];
  const answers = { 's-1': seen(true) };
  const order = introQueue(questions, { answers, count: 2, textLen: 20 });
  assert.equal(order.length, 4);
  // intro = the 2 easy UNSEEN questions (text ≤ 20 chars): s-2, s-3
  assert.deepEqual(new Set(order.slice(0, 2).map((x) => x.id)), new Set(['s-2', 's-3']));
  // s-1 (answered, last-correct) and s-4 (too long) form the remainder
  assert.deepEqual(new Set(order.slice(2).map((x) => x.id)), new Set(['s-1', 's-4']));
});

test('default constants match the historical view values', () => {
  assert.equal(INTRO_QUESTIONS, 5);
  assert.equal(INTRO_TEXT_LEN, 120);
});

test('shuffled is a pure permutation and respects injected rand', () => {
  const list = [1, 2, 3, 4, 5, 6, 7];
  const a = shuffled(list, rand32(1));
  const b = shuffled(list, rand32(1));
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort((x, y) => x - y), list);
  assert.notDeepEqual(a, list);
});
