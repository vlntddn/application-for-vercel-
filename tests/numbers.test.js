import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  hasNumber,
  numbersQueue,
  numberSpans,
} from '../public/js/domain/learning.js';

/** Deterministic PRNG (mulberry32) — same as tests/learning.test.js. */
function rand32(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + (t >>> 7) * 61;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const q = (id, text_it, is_true) => ({ id, text_it, is_true });
const DATA = { tokens: [{ token: '50' }, { token: '100' }, { token: '0,5' }] };

test('hasNumber: digit-boundary guards (50 not in 150/500, 0,5 not in 0,50)', () => {
  assert.equal(hasNumber('Il limite è 50 km/h', '50'), true);
  assert.equal(hasNumber('150 metri dal pericolo', '50'), false);
  assert.equal(hasNumber('velocità 500', '50'), false);
  assert.equal(hasNumber('tasso alcolemico 0,5 g/l', '0,5'), true);
  assert.equal(hasNumber('tasso 0,50 g/l', '0,5'), false);
  assert.equal(hasNumber('', '50'), false);
  assert.equal(hasNumber('niente numeri qui', '50'), false);
});

test('numbersQueue: ~50/50 FALSO/VERO, no two same-number in a row', () => {
  const questions = [
    q('n-1', 'il limite è 50', false),
    q('n-2', 'il limite è 50', false),
    q('n-3', 'il limite è 100', true),
    q('n-4', 'il limite è 100', true),
    q('n-5', 'tasso 0,5', true),
    q('n-6', 'tasso 0,5', false),
    q('n-7', 'niente numeri', false),
  ];
  const queue = numbersQueue(questions, DATA, 6, rand32(7));
  assert.equal(queue.length, 6, 'niente-numeri is excluded');
  assert.equal(queue.find((x) => x.id === 'n-7'), undefined);
  const falso = queue.filter((x) => !x.is_true).length;
  assert.equal(falso, 3, 'exactly 50/50');
  for (let i = 1; i < queue.length; i++) {
    assert.notEqual(queue[i].number, queue[i - 1].number, 'no same number in a row');
  }
});

test('numbersQueue: never pads, empty when no number question', () => {
  const queue = numbersQueue([q('n-1', 'il limite è 50', false)], DATA, 20, rand32());
  assert.equal(queue.length, 1, 'returns fewer than count, never pads');
  assert.deepEqual(numbersQueue([], DATA, 20, rand32()), []);
  assert.deepEqual(numbersQueue([q('n-1', 'niente numeri', false)], null, 20, rand32()), []);
});

test('numbersQueue: deterministic with an injected rand', () => {
  const questions = Array.from({ length: 40 }, (_, i) =>
    q(`n-${i}`, `il numero è ${i % 2 ? '50' : '100'}`, i % 3 === 0));
  const a = numbersQueue(questions, DATA, 20, rand32(9));
  const b = numbersQueue(questions, DATA, 20, rand32(9));
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
});

test('numberSpans: first number token is marked, original text kept', () => {
  const segs = numberSpans('Il limite è 50 km/h e non 100', ['50', '100']);
  assert.deepEqual(segs, [
    { text: 'Il limite è ', mark: false },
    { text: '50', mark: true },
    { text: ' km/h e non 100', mark: false },
  ]);
  // 100 appears but the FIRST occurrence wins (50 at position 12)
  const segs2 = numberSpans('a 100 b 50 c', ['50', '100']);
  assert.equal(segs2.find((s) => s.mark).text, '100');
  assert.deepEqual(numberSpans('niente', ['50']), [{ text: 'niente', mark: false }]);
  assert.deepEqual(numberSpans('', ['50']), [{ text: '', mark: false }]);
  assert.deepEqual(numberSpans('a 50', null), [{ text: 'a 50', mark: false }]);
});

test('data/insights/numbers.json: committed file = script output (файл = скрипт)', () => {
  const repoRoot = path.join(import.meta.dirname, '..');
  const file = path.join(repoRoot, 'data', 'insights', 'numbers.json');
  const before = fs.readFileSync(file, 'utf8');
  // The build is deterministic (contentHash-stamped): re-running it must not
  // change the committed file.
  execFileSync('node', ['scripts/build-numbers.mjs'], { cwd: repoRoot, stdio: 'pipe' });
  const after = fs.readFileSync(file, 'utf8');
  assert.equal(after, before, 're-running build-numbers.mjs must leave the committed file unchanged');
});

test('data/insights/numbers.json: build output is consistent with lessons.json', () => {
  const file = path.join(import.meta.dirname, '..', 'data', 'insights', 'numbers.json');
  assert.ok(fs.existsSync(file), 'numbers.json must be committed');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const lessons = JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, '..', 'data', 'lessons.json'), 'utf8'),
  );
  // every table row belongs to a real chapter and keeps its fact
  for (const row of data.table) {
    assert.ok(lessons.chapters[row.chapter], `unknown chapter ${row.chapter}`);
    assert.ok(row.tokens.length > 0, 'a table row always has numbers');
    assert.ok(row.fact && row.value);
    assert.ok(Number.isInteger(row.questions) && row.questions >= 0, 'row has a bank count');
  }
  // tokens are unique and every table token is in the tokens list
  const tokens = data.tokens.map((t) => t.token);
  assert.equal(new Set(tokens).size, tokens.length, 'tokens are unique');
  for (const row of data.table) {
    for (const t of row.tokens) assert.ok(tokens.includes(t), `token ${t} missing`);
  }
  // the drill pool is non-trivial on both sides
  const both = data.tokens.filter((t) => t.false > 0 && t.true > 0);
  assert.ok(both.length >= 3, 'at least 3 numbers exist on both FALSO and VERO sides');
});

/* ---------------- learner-language glossary (2026-10-04) ---------------- */

test('numbers glossary covers every table row in en, ru and zh', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const table = JSON.parse(fs.readFileSync(path.join(root, 'data/insights/numbers.json'), 'utf8')).table;
  const entries = JSON.parse(fs.readFileSync(path.join(root, 'data/numbers-glossary.json'), 'utf8')).entries;
  const keys = table.map((r) => `${r.chapter}|${r.fact}`);
  assert.deepEqual(keys.filter((k) => !entries[k]), [], 'every numbers row has a glossary entry');
  assert.deepEqual(Object.keys(entries).filter((k) => !keys.includes(k)), [], 'no orphan glossary entries');
  for (const [key, g] of Object.entries(entries)) {
    for (const field of ['title', 'value', 'meaning']) {
      for (const lang of ['en', 'ru', 'zh']) {
        assert.ok(typeof g[field]?.[lang] === 'string' && g[field][lang].trim().length > 1,
          `${key}.${field}.${lang} is filled`);
      }
    }
  }
});
