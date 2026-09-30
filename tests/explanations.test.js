import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractNumbers,
  mustKnowNumbers,
  validateExplanation,
  validateFile,
  checkAll,
  WHY_MAX_LEN,
} from '../scripts/check-explanations.mjs';

// A real question from the bank (cinture-casco-sicurezza → ch22) used as a
// stable fixture: its text carries the number 4, so invented-number checks
// have something to bite on.
const FIXTURE = {
  id: 'cinture-casco-sicurezza-caratteristiche-airbag-12',
  slug: 'cinture-casco-sicurezza',
  is_true: false,
  text_it: 'L’airbag non può essere montato su vetture con meno di 4 porte',
};

const CHAPTERS = {
  ch22: {
    mustKnow: [
      { fact_it: 'Cintura', value: 'sempre', note: { en: 'always worn', ru: 'всегда', zh: '始终系好' } },
      { fact_it: 'Casco', value: '1 porta', note: { en: 'one door', ru: 'одна дверь', zh: '一扇门' } },
    ],
  },
};

function validEntry() {
  return {
    verdict: 'FALSO',
    key_it: 'meno di 4 porte',
    chapter: 'ch22',
    why: {
      en: 'Airbags can be fitted on most cars; the number of doors does not matter.',
      ru: 'Аирбег ставится почти на все машины; число дверей не имеет значения.',
      zh: '安全气囊可装于大多数汽车；车门数量不重要。',
    },
    source: 'ai-draft',
    model: 'test',
    at: '2026-09-30',
  };
}

test('valid entry passes all six rules', () => {
  assert.deepEqual(validateExplanation(validEntry(), FIXTURE, CHAPTERS), []);
});

// The five error kinds the gate must catch.

test('error kind 1: verdict mismatch', () => {
  const e = validEntry();
  e.verdict = 'VERO';
  const errs = validateExplanation(e, FIXTURE, CHAPTERS);
  assert.ok(errs.some((s) => s.includes('verdict')), errs.join(' | '));
});

test('error kind 2: key_it not a substring of text_it', () => {
  const e = validEntry();
  e.key_it = 'meno di 5 porte';
  const errs = validateExplanation(e, FIXTURE, CHAPTERS);
  assert.ok(errs.some((s) => s.includes('key_it')), errs.join(' | '));
});

test('error kind 3: wrong chapter', () => {
  const e = validEntry();
  e.chapter = 'ch21';
  const errs = validateExplanation(e, FIXTURE, CHAPTERS);
  assert.ok(errs.some((s) => s.includes('chapter')), errs.join(' | '));
});

test('error kind 4a: number in why not in text_it or mustKnow', () => {
  const e = validEntry();
  // 7 appears nowhere in text_it (4) nor in ch22 mustKnow (1).
  e.why.en = 'This is only true when there are 7 seats in the car.';
  const errs = validateExplanation(e, FIXTURE, CHAPTERS);
  assert.ok(errs.some((s) => s.includes('invented number 7')), errs.join(' | '));
});

test('error kind 4b: number IS allowed when from mustKnow', () => {
  const e = validEntry();
  // 1 is in ch22 mustKnow ("1 porta"), so it must NOT be flagged.
  e.why.en = 'A single-door car is the one-door case.';
  const errs = validateExplanation(e, FIXTURE, CHAPTERS);
  assert.ok(!errs.some((s) => s.includes('invented number 1')), errs.join(' | '));
});

test('error kind 5a: a language missing', () => {
  const e = validEntry();
  delete e.why.ru;
  const errs = validateExplanation(e, FIXTURE, CHAPTERS);
  assert.ok(errs.some((s) => s.includes('why.ru')), errs.join(' | '));
});

test('error kind 5b: why longer than the limit', () => {
  const e = validEntry();
  e.why.zh = '长'.repeat(WHY_MAX_LEN + 1);
  const errs = validateExplanation(e, FIXTURE, CHAPTERS);
  assert.ok(errs.some((s) => s.includes('why.zh')), errs.join(' | '));
});

test('error kind 5c: why duplicates text_it', () => {
  const e = validEntry();
  e.why.en = FIXTURE.text_it;
  const errs = validateExplanation(e, FIXTURE, CHAPTERS);
  assert.ok(errs.some((s) => s.includes('duplicates text_it')), errs.join(' | '));
});

test('error kind 6: unknown id in a file', () => {
  const problems = validateFile(
    { items: { 'no-such-id-1': validEntry() } },
    new Map(),
    CHAPTERS,
  );
  assert.ok(problems.some((p) => p.id === 'no-such-id-1' && p.errors[0].includes('not in the question bank')));
});

test('extractNumbers: integers, decimals, commas', () => {
  assert.deepEqual([...extractNumbers('30 km/h e 2.5 m')].sort(), [2.5, 30]);
  assert.deepEqual([...extractNumbers('Euro 0')], [0]);
});

test('mustKnowNumbers: gathers numbers from every fact field', () => {
  const nums = mustKnowNumbers(CHAPTERS.ch22);
  assert.ok(nums.has(1));
  assert.equal(nums.has(0), false);
});

test('checkAll: the shipped data/explanations/ is valid (or empty)', () => {
  const root = new URL('..', import.meta.url).pathname;
  assert.deepEqual(checkAll(root), []);
});
