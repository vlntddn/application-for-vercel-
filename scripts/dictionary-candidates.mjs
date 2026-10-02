#!/usr/bin/env node
// S4.1 — скрипт-кандидатор для расширения словаря.
// Частотный анализ text_it всего банка вопросов (нижний регистр, без
// акцентов, стоп-слова), исключает слова, уже в data/dictionary.json,
// печатает топ-300 с частотой и 2 примерами id. Только чтение.

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOP_N = 300;

const STOP = new Set([
  // артикли и предлоги (слитные формы и формы без акцентов)
  'a', 'ad', 'ai', 'allo', 'alla', 'alle', 'al', 'all', 'agli', 'agl',
  'e', 'ed', 'd', 'da', 'dai', 'dallo', 'dalla', 'dalle', 'degli', 'dei',
  'del', 'della', 'delle', 'degl', 'de', 'di', 'in', 'nei', 'nello', 'nella',
  'nelle', 'negli',
  'n', 'dal', 'per', 'tra', 'fra', 'con', 'su', 'sui', 'sullo', 'sulla',
  'sulle',
  'senza', 'entro', 'fuori', 'contro', 'presso', 'durante',
  // короткие слитные предлог+артикль (остаются после токенизации)
  'nel', 'sul', 'dal', 'del', 'gli', 'l', 'allo',
  // неопределённые артикли
  'un', 'una', 'uno', 'un',
  // союзы и частицы
  'o', 'oppure', 'ma', 'ne', 'che', 'se', 'come', 'quindi', 'infatti',
  'perche', 'pero', 'ancora', 'gia', 'anche', 'poi', 'quasi',
  // универсальные глаголы без предметного содержания
  'indica', 'indicare', 'indicare', 'rappresenta', 'rappresentare', 'rappresentano',
  'significa', 'significare', 'significano', 'consiste', 'consistere',
  'comprende', 'comprendere', 'comprendono', 'comprende',
  'serve', 'servire', 'servono', 'utilizzare', 'utilizza', 'utilizzo',
  'usare', 'usa', 'usando', 'permette', 'permettere', 'permettono',
  'richiede', 'richiedere', 'richiedono', 'necessario', 'necessaria', 'necessari',
  'necessarie', 'opportuno', 'opportuna', 'opportuni', 'opportune',
  'possibile', 'possibile', 'necessario', 'opportuno',
  // местоимения и притяжательные
  'ci', 'vi', 'si', 'me', 'te', 'se', 'lui', 'lei', 'noi', 'voi', 'loro',
  'mio', 'mia', 'tuo', 'tua', 'suo', 'sua', 'nostro', 'nostra', 'vostro', 'vostra',
  'altri', 'altre', 'altro', 'stesso', 'stessa', 'medesimo', 'ognuno',
  // указательные и вопросительные
  'questo', 'questa', 'questi', 'queste', 'quello', 'quella', 'quelli', 'quelle',
  'chi', 'cui', 'quale', 'quali', 'quanto', 'quanta', 'quanti', 'quante',
  'quando', 'dove', 'affinche',
  // определительные
  'tutti', 'tutte', 'tutto', 'tutta', 'ogni', 'alcuni', 'alcune', 'alcuno',
  'alcuna', 'nessuno', 'nessuna', 'molto', 'molta', 'molti', 'molte', 'poco',
  'poca', 'pochi', 'poche', 'piu', 'meno', 'tali', 'tale', 'qualche', 'ciascuno',
  'ciascuna', 'vario', 'varia', 'diverso', 'diversa', 'medesima',
  // базовые глаголы (без акцентов)
  'non', 'essere', 'sono', 'sei', 'siamo', 'siete', 'era', 'eri',
  'erano', 'sara', 'avranno', 'fui', 'fummo', 'fosse', 'foste',
  'avere', 'ho', 'hai', 'ha', 'abbiamo', 'avete', 'hanno', 'aveva', 'avevamo',
  'avevano', 'fare', 'fa', 'fai', 'faccio', 'facciamo', 'fate',
  'fanno', 'fatta', 'fatto',
  'andare', 'vado', 'vai', 'va', 'andiamo', 'vanno',
  'potere', 'puo', 'posso', 'puoi', 'possiamo', 'potete', 'possono', 'poteva',
  'potevano', 'potrebbe',
  'deve', 'devono', 'devo', 'devi', 'doveva', 'dovevano', 'dovete', 'dovendo',
  'dovra',
  'volere', 'vuole', 'vogliamo', 'vogliono', 'voleva', 'volevano',
  'sapere', 'sa', 'so', 'sai', 'sappiamo', 'sanno', 'sapeva',
  'conoscere', 'conosce', 'conosco', 'conoscono', 'conosceva',
  'stare', 'sto', 'stai', 'sta', 'stiamo', 'state', 'stanno',
  'venire', 'vengo', 'viene', 'veniamo', 'vengono', 'venne', 'venivano',
  'tenere', 'tiene', 'tengo', 'teneva', 'tenuto',
  'uscire', 'esce', 'usciamo', 'escono',
  'stato', 'stata', 'stati', 'state',
  // частая "пустая" лексика и числительные
  'modo', 'caso', 'volta', 'volte', 'giorno', 'giorni', 'punto', 'punti',
  'cosa', 'cose', 'maniera', 'forma',
  'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove',
  'dieci', 'cento', 'mille',
]);

function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '');
}

// Слитные предлог+артикль: nell'incrocio → токены [nell, incrocio],
// "nell" отбрасывается, остаётся "incrocio"
const CONJ_PREFIX = /^(nell|sull|dell|quell|quest|dall|agl|all)/;

function tokenize(s) {
  const out = [];
  for (const raw of normalize(s).split(/[^a-z]+/)) {
    if (!raw) continue;
    const tok = CONJ_PREFIX.test(raw) ? raw.replace(CONJ_PREFIX, '') : raw;
    if (tok) out.push(tok);
  }
  return out;
}

// Словарь: из "l'attraversamento pedonale" → { attraversamento, pedonale }
const dictionary = JSON.parse(readFileSync(join(ROOT, 'data/dictionary.json'), 'utf8'));
const known = new Set();
for (const section of dictionary.sections) {
  for (const term of section.terms) {
    for (const tok of tokenize(term.it)) {
      known.add(tok);
    }
  }
}

const freq = new Map(); // word -> { count, examples: [id1, id2] }
const files = readdirSync(join(ROOT, 'data/questions'))
  .filter((f) => f.endsWith('.json'))
  .sort();

for (const file of files) {
  const questions = JSON.parse(
    readFileSync(join(ROOT, 'data/questions', file), 'utf8'),
  );
  for (const q of questions) {
    if (!q || typeof q.text_it !== 'string') continue;
    const seenInQuestion = new Set();
    for (const raw of tokenize(q.text_it)) {
      if (raw.length < 3 || STOP.has(raw) || known.has(raw)) continue;
      if (seenInQuestion.has(raw)) continue;
      seenInQuestion.add(raw);
      let entry = freq.get(raw);
      if (!entry) {
        entry = { count: 0, examples: [] };
        freq.set(raw, entry);
      }
      entry.count += 1;
      if (q.id && entry.examples.length < 2) entry.examples.push(q.id);
    }
  }
}

const top = [...freq.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, TOP_N);

console.log(`# Кандидаты в словарь (топ-${top.length} из ${freq.size} уникальных слов, банк: ${files.length} файлов)`);
console.log(`# known excluded: ${known.size} слов уже в data/dictionary.json`);
console.log('# rank  freq  word  examples');
top.forEach(([word, e], i) => {
  console.log(
    `${String(i + 1).padStart(3)}   ${String(e.count).padStart(5)}  ${word}  ${e.examples.slice(0, 2).join(' | ')}`,
  );
});
