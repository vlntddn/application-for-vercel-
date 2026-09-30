import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  termLemma,
  buildDictionaryTapIndex,
  dictionaryTapTerm,
} from '../public/js/domain/learning.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dictionary = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'dictionary.json'), 'utf8'));

// Small hand-built index for deterministic matching (independent of the bank).
const terms = [
  { it: 'la carreggiata', en: 'carriageway', ru: 'проезжая часть', zh: '车行道' },
  { it: 'il doppio senso', en: 'two-way traffic', ru: 'двустороннее движение', zh: 'двухстороннее движение' },
  { it: 'la corsia', en: 'lane', ru: 'полоса', zh: 'полоса' },
  { it: "l'incrocio", en: 'intersection', ru: 'перекрёсток', zh: 'перекрёсток' },
];
const index = buildDictionaryTapIndex([{ id: 'test', terms }]);

test('termLemma strips the leading article, gloss, and lowercases', () => {
  assert.equal(termLemma('la carreggiata'), 'carreggiata');
  assert.equal(termLemma("l'incrocio"), 'incrocio');
  assert.equal(termLemma("l'incidente (stradale)"), 'incidente');
  assert.equal(termLemma('IL Conducente'), 'conducente');
  assert.equal(termLemma('doppio senso'), 'doppio senso'); // no article — kept as is
  assert.equal(termLemma(''), '');
});

test('dictionaryTapTerm matches a term as a whole word and reports offsets', () => {
  const text = 'La carreggiata deve essere libera';
  const hit = dictionaryTapTerm(text, index);
  assert.ok(hit);
  assert.equal(hit.term.it, 'la carreggiata');
  assert.equal(text.slice(hit.start, hit.end), 'carreggiata');
});

test('dictionaryTapTerm matches by lemma — article in the question does not matter', () => {
  const text = 'E’ vietato invertire il doppio senso';
  // Question uses "doppio senso" without a leading article; the term has "il".
  const hit = dictionaryTapTerm(text, index);
  assert.ok(hit);
  assert.equal(hit.term.it, 'il doppio senso');
  assert.equal(text.slice(hit.start, hit.end), 'doppio senso');
});

test('dictionaryTapTerm is accent-insensitive', () => {
  const hit = dictionaryTapTerm("L’incrocio è pericoloso", index);
  assert.ok(hit);
  assert.equal(hit.term.it, "l'incrocio");
  const text = "L’incrocio è pericoloso";
  assert.equal(text.slice(hit.start, hit.end), 'incrocio');
});

test('dictionaryTapTerm respects word boundaries', () => {
  assert.equal(dictionaryTapTerm('Mantenga la corsia destra', index).term.it, 'la corsia');
  // Plural "corsie" is a different word — no match.
  assert.equal(dictionaryTapTerm('Le corsie sono chiuse', index), null);
  // "corsia" embedded inside a longer word must not match.
  assert.equal(dictionaryTapTerm('La corsiarde è libera', index), null);
});

test('dictionaryTapTerm returns null when no term occurs', () => {
  assert.equal(dictionaryTapTerm('Parcheggio riservato', index), null);
  assert.equal(dictionaryTapTerm('', index), null);
  assert.equal(dictionaryTapTerm('La carreggiata', []), null);
});

test('dictionaryTapTerm prefers the longer term at the same position', () => {
  // "carreggiata" is a substring of "carreggiabile"? No — use multi-word vs
  // single: "doppio senso" contains the word "senso"; a one-word term "senso"
  // would shadow it if sorted by position only. Longest-lemma-first avoids it.
  const idx = buildDictionaryTapIndex([{ id: 't', terms: [
    { it: 'il senso', en: 'sense', ru: 'см.', zh: 'см.' },
    { it: 'il doppio senso', en: 'two-way', ru: 'двухстороннее', zh: 'двухстороннее' },
  ]}]);
  const hit = dictionaryTapTerm('E’ vietato il doppio senso', idx);
  assert.equal(hit.term.it, 'il doppio senso');
});

test('real bank: at least one question text per section language resolves a term', () => {
  const realIndex = buildDictionaryTapIndex(dictionary.sections);
  assert.ok(realIndex.length >= 100); // sanity: the shipped dictionary is loaded
  const questionsDir = path.join(ROOT, 'data', 'questions');
  let hits = 0;
  for (const f of fs.readdirSync(questionsDir).filter((x) => x.endsWith('.json'))) {
    const qs = JSON.parse(fs.readFileSync(path.join(questionsDir, f), 'utf8'));
    if (qs.some((q) => dictionaryTapTerm(q.text_it, realIndex))) hits++;
  }
  assert.ok(hits >= 20, `only ${hits} question files contain dictionary terms`);
});

test('dictionaryTapTerm matches the contracted form l’… in the question', () => {
  const text = 'In l’incrocio, si fermi';
  const hit = dictionaryTapTerm(text, index);
  assert.ok(hit);
  assert.equal(hit.term.it, "l'incrocio");
  assert.equal(text.slice(hit.start, hit.end), 'incrocio');
});

test('matched offsets always cut a real substring of the question text', () => {
  const realIndex = buildDictionaryTapIndex(dictionary.sections);
  const qs = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data', 'questions', 'alcool-droga-primo-soccorso.json'), 'utf8'));
  for (const q of qs) {
    const hit = dictionaryTapTerm(q.text_it, realIndex);
    if (!hit) continue;
    assert.equal(q.text_it.slice(hit.start, hit.end).toLowerCase(), termLemma(hit.term.it));
    assert.ok(hit.term.en && hit.term.ru && hit.term.zh, 'term carries all three translations');
  }
});
