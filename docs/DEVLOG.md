## 2026-09-29 18:20 — S2.L1c: тренажёр «Язык экзамена» (#/drill/signals)

Что сделано (коммит `feat: тренажёр «Язык экзамена» #/drill/signals … (L1c)`
на self-improve):
- **public/js/domain/learning.js**: `signalQueue(questions, insights, size, rand)`
  — очередь из 20 вопросов банка со словами-сигналами, ровно 50/50 между
  FALSO и ВЕРНЫМИ-контрпримерами (взвешенный выбор, дедупликация по id);
  `signalSpans(text, words)` — чистая функция, возвращает сегменты
  `[{text, mark}]` для подсветки **первого** вхождения сигнала (без учёта
  регистра/акцентов, без совпадения подстрок в других словах). Оба —
  примитивы, потому что чистые, живут в learning.js (требование архитектуры).
- **public/js/views/drill.js**: рендер drill-сессии; `questionText()` строит
  DOM из сегментов `signalSpans` → `<mark.ds-signal>` для сигнала. Post-answer
  feedback: «this word is FALSO in N% — here it is TRUE because …» — `because`
  только если у вопроса есть `trap-why` в lessons, иначе без него.
- **Маршруты**: `api.insights`, `state.loadInsights`, роут `#/drill/signals`;
  ссылки из «L'italiano dell'esame» (theory) и с главной (dashboard).
- **public/styles.css**: `mark.ds-signal`, `.signal-notes`. **public/sw.js**: v64.
- **tests/learning.test.js**: +4 теста `signalQueue`, +4 теста `signalSpans`
  (подсветка первого вхождения, акценты/регистр, без подстрок, пустой ввод).

Проверка: `scripts/verify.sh` → VERIFY OK (123 npm-теста, smoke 8/200 на :3917,
qa-new-user 37/0). `scripts/qa-ux.mjs` → 174 PASS, 2 FAIL — оба pre-existing
(не блок, см. S2.L1b): p7 `#/` next-steps и p8 `#/review` button-wrap. Новый
маршрут не в покрытии qa-ux. Проблем: нет.

## 2026-09-29 17:05 — S2.L1b: «L'italiano dell'esame» на данных банка

Что сделано (коммиты `feat: слова-сигналы в гайде экзамена … (L1b)` и
`fix: L1b — доля FALSO в банке на языке ученика …` на self-improve):
- **data/lessons.json → examItalian**: у слов-абсолютов `bankStats` из
  `data/insights/signal-words.json`: sempre 80 (66.3% FALSO), solo/soltanto
  246 (75.2%), anche 242 (43.4%) — с `firstTrue` (id + text_it реального
  VERO-контрпримера из банка) и `takeaway` (en/ru/zh); mai — takeaway без
  цифр (не прошёл порог 20, объясняем почему). Плюс локализованные шаблоны
  `examItalian.bankStat`: template «IN THE BANK · {f} of {n} are {word}» /
  «В БАНКЕ · {f} из {n} — {word}» / «题库中 · …», слова falso/vero, showTrue —
  дробь и кнопка рендерятся на языке ученика (требование задачи).
- **public/js/views/theory.js**: `absoluteWordData(w, bankStat)` — строка
  статистики с дробью на языке ученика, `details.word-true` с кнопкой
  «Покажи верное» (реальный текст VERO + тег VERO), строка takeaway.
  Слова без bankStats рендерятся как раньше.
- **public/styles.css**: `.word-stat`, `details.word-true` (summary ≥44px —
  touch-target), `.word-true-q`, `.word-takeaway`.
- **public/sw.js**: v61 → v63.
- **tests/lessons.test.js**: тест `bank stats from the real bank` — цифры
  совпадают с signal-words.json, контрпример существует в банке и
  `is_true === true`, mai — takeaway без числа. 4/4 pass.

Как проверено: `scripts/verify.sh` → VERIFY OK (npm test 116 passed,
qa-new-user 37 PASS / 0 FAIL).

## 2026-09-29 16:40 — S2.L1a: Скрипт инсайтов слов-сигналов
