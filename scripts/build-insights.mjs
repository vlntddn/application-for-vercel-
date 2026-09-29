#!/usr/bin/env node
// L1a — детерминированная сборка data/insights/signal-words.json.
// Считает по слову/фразе: число вопросов банка, долю FALSO, 2 id FALSO
// и 1–2 id ВЕРНЫХ-контрпримера (при наличии). Слова с < 20 вопросами —
// не выводятся. Все списки id — в порядке возрастания (стабильный вывод).
// Запуск: node scripts/build-insights.mjs  (идемпотентно: перезаписывает файл).
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const OUT = path.join(root, 'data', 'insights', 'signal-words.json');

// Слова/фразы-сигналы (в исходном виде, как в роадмапе).
const SIGNAL_WORDS = [
  'solo', 'soltanto', 'esclusivamente', 'sempre', 'mai', 'tutti',
  'qualsiasi', 'purché', 'è obbligatorio', 'deve', 'può', 'salvo',
  'eccetto', 'tranne', 'anche', 'almeno', 'non oltre',
];
const MIN_QUESTIONS = 20;

// Нормализация: нижний регистр, без акцентов (э → e).
export function normalize(it) {
  return it.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Границы слова в тексте БЕЗ акцентов: начало/конец совпадения не должны
// оказаться буквой/цифрой — тогда "mai" не совпадёт внутри "maimai",
// а для фраз "non oltre" границы — у краёв всей фразы.
function matches(text, pattern) {
  const n = normalize(text);
  const re = new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, 'g');
  re.lastIndex = 0;
  return re.test(n);
}

export function loadQuestions(dir = path.join(root, 'data', 'questions')) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

export function buildSignalWords(questions = loadQuestions()) {
  const total = questions.length;
  const words = [];
  for (const word of SIGNAL_WORDS) {
    const pattern = normalize(word);
    const ids = questions
      .filter((q) => matches(q.text_it, pattern))
      .map((q) => q.id)
      .sort();
    if (ids.length < MIN_QUESTIONS) continue;
    const hitIds = new Set(ids);
    const falseQs = questions.filter((q) => hitIds.has(q.id) && q.is_true === false);
    const trueQs = questions.filter((q) => hitIds.has(q.id) && q.is_true === true);
    // 2 примера FALSO (меньше — сколько есть) + 1–2 контрпримера VERO:
    // 1 если контрпримеров нет или всего один, иначе 2.
    const falseIds = falseQs.map((q) => q.id).sort().slice(0, 2);
    const trueIds = trueQs.map((q) => q.id).sort();
    words.push({
      word,
      questions: ids.length,
      falseRatio: falseQs.length / ids.length,
      bank: total,
      falseIds,
      trueIds: trueIds.slice(0, trueIds.length <= 1 ? 1 : 2),
    });
  }
  return { generatedBy: 'scripts/build-insights.mjs', bank: total, words };
}

const data = buildSignalWords();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
console.log(`signal-words.json: ${data.words.length} слов, банк ${data.bank}`);
