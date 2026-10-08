import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { buildSignalWords, loadQuestions, normalize } from '../scripts/build-insights.mjs';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'data', 'insights', 'signal-words.json');

const questions = loadQuestions();
const byId = new Map(questions.map((q) => [q.id, q]));

const file = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const byWord = new Map(file.words.map((w) => [w.word, w]));

test('normalize: нижний регистр без акцентов', () => {
  assert.equal(normalize('È Obbligatorio NON OLTRE'), 'e obbligatorio non oltre');
});

test('file === вывод скрипта (детерминированность)', () => {
  const built = buildSignalWords();
  assert.deepEqual(file, built);
});

test('bank совпадает с реальным числом вопросов', () => {
  assert.equal(file.bank, questions.length);
  for (const w of file.words) assert.equal(w.bank, questions.length);
});

test('words: solo ≥ 70% FALSO, salvo ≤ 35%', () => {
  assert.ok((byWord.get('solo')?.falseRatio ?? 0) >= 0.7, `solo=${byWord.get('solo')?.falseRatio}`);
  assert.ok((byWord.get('salvo')?.falseRatio ?? 1) <= 0.35, `salvo=${byWord.get('salvo')?.falseRatio}`);
});

test('words: слова с < 20 вопросами не выведены, все ≥ 20', () => {
  assert.ok(!byWord.has('eccetto'), 'eccetto (< 20) не должен быть в файле');
  assert.ok(!byWord.has('tranne'));
  assert.ok(!byWord.has('non oltre'));
  for (const w of file.words) assert.ok(w.questions >= 20, `${w.word}=${w.questions}`);
});

test('words: счётчики воспроизводятся независимой пересчётной логикой', () => {
  for (const w of file.words) {
    const re = new RegExp(`(^|[^a-z0-9])${normalize(w.word)}([^a-z0-9]|$)`);
    const hits = questions.filter((q) => re.test(normalize(q.text_it)));
    assert.equal(w.questions, hits.length, `${w.word}: ${w.questions} vs ${hits.length}`);
    const falseCount = hits.filter((q) => q.is_true === false).length;
    assert.ok(Math.abs(w.falseRatio - falseCount / hits.length) < 1e-9, w.word);
  }
});

test('words: по 2 примера FALSO и 1–2 контрпримера VERO', () => {
  for (const w of file.words) {
    assert.equal(w.falseIds.length, 2, `${w.word}: falseIds=${w.falseIds.length}`);
    assert.ok(w.trueIds.length >= 1 && w.trueIds.length <= 2, `${w.word}: trueIds=${w.trueIds.length}`);
  }
});

test('words: все id существуют, ложь/правда как заявлено, списки сортированы', () => {
  for (const w of file.words) {
    for (const id of w.falseIds) {
      const q = byId.get(id);
      assert.ok(q, `${w.word}: id не найден ${id}`);
      assert.equal(q.is_true, false, `${w.word}: ${id} должен быть FALSO`);
      assert.ok(normalize(q.text_it).includes(normalize(w.word)), `${w.word}: ${id} не содержит слово`);
    }
    for (const id of w.trueIds) {
      const q = byId.get(id);
      assert.ok(q, `${w.word}: id не найден ${id}`);
      assert.equal(q.is_true, true, `${w.word}: ${id} должен быть VERO`);
      assert.ok(normalize(q.text_it).includes(normalize(w.word)), `${w.word}: ${id} не содержит слово`);
    }
    for (const ids of [w.falseIds, w.trueIds]) {
      assert.deepEqual(ids, [...ids].sort(), `${w.word}: списки id должны быть сортированы`);
    }
  }
});

test('words: пересборка скриптом даёт байт-в-байт тот же файл', () => {
  const before = fs.readFileSync(OUT, 'utf8');
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build-insights.mjs')], { cwd: root });
  const after = fs.readFileSync(OUT, 'utf8');
  assert.equal(after, before);
});
