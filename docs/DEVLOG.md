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
