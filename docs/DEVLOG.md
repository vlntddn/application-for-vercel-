# DEVLOG — Passo (последнее сверху)


## 2026-09-29 — L5b: Путь обучения — экран `#/path`

Что сделано (коммит `feat: экран пути обучения #/path — карточки шагов, Continue, запись self-check в прогресс (L5b)` на self-improve):
- **public/js/views/path.js** (новый) — `renderPath`: карточка на каждый шаг
  (25 глав, `PATH_ORDER`), «Step N of 25», пайплайн Read → Check → Practice
  с отметкой текущей фазы, кнопка «Continue» ведёт в нужную часть шага
  (`pathContinueTarget`: Read → `#/theory/<id>`, Check → `#/theory/<id>/check`,
  Practice → практика темы); завершённые шаги — с отметкой done, готовность
  `ready` → карточка «Start a mock exam». `pathLinkCard` — карточка-ссылка
  первой на главной («Step N of 25 — <тема>», «0 of 25 steps done»).
- **public/js/main.js / views.js** — маршрут `#/path`, реэкспорт `renderPath`,
  `pathLinkCard`. **dashboard.js** — `renderDashboard` стал async, вставляет
  `pathLinkCard` первой.
- **Запись self-check в прогресс** (без неё статус шага не двигался):
  `api.recordChapterCheck` + `POST /api/progress/chapters` +
  `recordChapterCheck` в `domain/progress.js`/`local-progress.js`
  (`chapters[id].check = { correct, total, date }`); theory.js пишет результат
  чек-а (5 вопросов = `PATH_CHECK_QUESTIONS`), `#/theory/<id>/check` сразу
  открывает чек.
- **tests**: learning/progress — тесты recordChapterCheck; security.test.js —
  `renderDashboard` теперь async (строчный маркер). **sw.js**: v68 → v69.
- **qa-new-user.mjs** — новый шаг «путь ведёт новичка в урок 1»:
  `#/path` рендерит заголовок, первый шаг — «Step 1 of 25», Continue новичка
  ведёт в `#/theory/ch1`; `#/path` добавлен в список маршрутов.
- **Как проверено:** verify — 149 unit-тестов, smoke 8 эндпоинтов,
  qa-new-user 42 PASS / 0 FAIL (VERIFY OK).

## 2026-09-29 — L5a: Путь обучения — модель `learningPath()`

Что сделано (коммит `feat: L5a — модель пути обучения learningPath … (L5a)` на self-improve):
- **public/js/domain/learning.js** — новая модель пути обучения:
  - `PATH_ORDER` — рекомендованный порядок глав (ch1…ch9 → ch12/ch13,
    остальное — по номеру главы);
  - `PATH_MINI_PASS = 4` (мини-проверка: ≥ 4/5), `PATH_MASTERY_PCT = 80`
    (освоение темы ≥ 80% банка);
  - `learningPath(progress, manifest, lessons)` → `{ steps, currentIndex, ready }`:
    один шаг на главу (id, chapter, slug, name, read, check, mastered,
    masteryPct, done, status). `done` — мягкий: прочитан урок **или**
    последний мини-чек ≥ 4/5 **или** mastery ≥ 80% банка темы
    (сравнение без округления: 424/531 = 79.85% → не done, хотя дисплей
    покажет «80%»). `status`: 'done' / 'ready' (первый незавершённый) /
    'open'; следующие шаги не блокируются. `ready` = true, когда все шаги
    done («exam ready»). `masteryOf` вызывается с `progress?.answers || {}`
    (устойчиво к прогрессу без ключа). Поле `progress.chapters[id].check`
    пока не в схеме progress — писать его будет L5b.
- **tests/learning.test.js** — блок L5a (6 тестов): порядок PATH_ORDER + хвост
  по номеру; новичок → шаг 1 'ready', остальные 'open'; прочитан → done;
  мини-чек 4/5 done, 3 — open; mastery порог (enough → done, enough−1 → ready);
  всё прочитано → currentIndex −1, ready true.
- **public/sw.js**: v67 → v68.

Как проверено: node --test tests/learning.test.js — 32/32 pass;
scripts/verify.sh — VERIFY OK (npm test 145 passed, smoke 8×200,
qa-new-user 37 PASS). Проблем не было.

## 2026-09-29 — L4: «Числа, которые надо знать» — таблица-справка + тренажёр #/numbers

Что сделано (коммит `feat: L4 — … #/numbers (L4)` на self-improve):
- **scripts/build-numbers.mjs** (новый): из data/lessons.json берёт все
  mustKnow-строки, чей value содержит число (токены: km/h, м, ‰, баллы/пункты,
  годы, метры, сек), собирает per-chapter счётчик вопросов банка, содержащих эти
  числа. Детерминированный — штамп contentHash; повторный запуск не меняет файл.
  Вывод: data/insights/numbers.json (18 строк таблицы, 20 числовых токенов).
- **data/insights/numbers.json** (новый): таблица по темам + токены с
  распределением FALSO/VERO в банке.
- **public/js/views/numbers.js** (новый): renderNumbers — экран #/numbers.
  State 1: таблица-справка (тема → факт → значение, число выделено
  num-highlight). State 2: тренажёр 20 вопросов FALSO/VERO с числами
  (numbersQueue, ~50/50, нет двух одинаковых чисел подряд), подсветка числа,
  feedback, звук, NEXT/FINISH.
- **public/js/domain/learning.js**: numbersQueue(questions, numbers, size) —
  выборка 50/50 FALSO/VERO с допусками под кособокость банка (230 F / 182 T),
  numberSpans(text, tokens) — разметка первого числового токена.
- **public/js/api.js**: endpoint numbers(). **public/js/state.js**:
  loadNumbers(). **public/js/views.js** + **public/js/main.js**: маршрут
  #/numbers. **public/js/views/dashboard.js**: кнопка «THE NUMBERS YOU MUST KNOW».
- **public/styles.css**: блок .numbers-table (тема/факт/значение, полосатые
  строки, num-highlight). **public/sw.js**: v66 → v67, numbers.js в SHELL.
- **tests/numbers.test.js** (новый, 5 тестов): hasNumber-границы, numbersQueue
  (50/50, не падает, детерминизм при rand), numberSpans, «файл = скрипт»
  (execFileSync build-numbers.mjs → файл не меняется) и согласованность с
  lessons.json.

Как проверено: npm test — 137 passed / 0 fail; verify.sh — VERIFY OK
(incl. «no public/ changes needing a sw.js bump», smoke 8 endpoints 200).
Тест «файл = скрипт» подтверждает, что закоммиченный numbers.json воспроизводится
скриптом. Экран #/numbers, кнопка на главной, offline (SW shell v67, /data/ SWR).

## 2026-09-29 — L3: «Почему я ошибаюсь» — причины на /#/mistakes

Что сделано (коммиты `feat: L3 — ...` и `docs: L3 ...` на self-improve):
- **public/js/domain/learning.js**: `mistakeCauses(answers, questions, insights, lessons)` —
  по текущим ошибкам (lastCorrect=false) теги причин: signal (слово-сигнал из
  data/insights/signal-words.json), sign (есть image_url), number (цифра в тексте),
  rule (фолбэк); возвращает perQuestion + counts.
- **public/js/views/review.js** (`renderMistakes`): панель «Most of your
  mistakes: … (N of M)» + PRACTICE THIS — signal → #/drill/signals, rule →
  глава с максимумом rule-ошибок (с её названием), sign/number → #/practice.
  При недоступности insights (standalone) панель тихо не показывается.
- **tests/learning.test.js**: 2 теста mistakeCauses (тэгирование, комбинации,
  counts; пустые/null-входы) — 24/24 pass.
- **public/sw.js**: v65 → v66.
Почему: задача L3 роадмапа — объяснить ученику, в чём именно он ошибается,
и дать кнопку сразу в нужное место. Как проверено: unit-тесты, verify.sh
(VERIFY OK).
Проверка после L3 (по требованию роадмапа): verify.sh — VERIFY OK; qa-new-user —
37 PASS / 0 FAIL; qa-ux — 174 PASS / 2 FAIL (оба — pre-existing: p7 next-steps
и p8 обтекание текста в кнопке, не на маршрутах L3).


## 2026-09-29 — S2.L2: подсветка сигналов в вопросе (практика/повторение)

Что сделано (коммиты `feat: L2 — подсветка сигнала в вопросе … (L2)` и
`test: L2 — тесты signalHints … (L2)` на self-improve; код — остатки
предыдущего незавершённого запуска, тесты — новые этого запуска):
- **public/js/domain/learning.js**: `attemptedCount(answers)`,
  `SIGNAL_HINTS_AUTO_LIMIT = 100`, `signalHintsEnabled(profile, answers)`
  (auto = вкл. пока отвечено < 100 вопросов, потом выкл.; on/off всегда),
  `findSignalWord`, `signalGlossary(lessons, insights)` — переводы
  слов-сигналов из экзамен-урока.
- **public/js/domain/progress.js**: `SIGNAL_HINT_MODES = [auto, on, off]`;
  поле `profile.signalHints` (дефолт auto) в EMPTY_PROGRESS, migrateProgress
  (невалидное значение → auto) и валидация updateProfile/importProgress (422).
- **public/js/views/practice.js**: `signalText(q)` — первое вхождение
  слова-сигнала в `<mark.ds-signal role=button>` c aria-describedby; тап/Enter
  → Callout (слово, перевод, доля FALSO в банке); закрытие тапом вне / Escape
  / сменой вопроса. ЭКЗАМЕН НЕ ЗАТРАГИВАЕТСЯ (grep ds-signal в exam.js пуст).
- **public/js/views/settings.js**: селект Auto/On/Off. **public/styles.css**:
  `.ds-signal-callout`. **public/sw.js**: v65.
- **tests/learning.test.js**: +4 теста (attemptedCount, on/off, порог 99/100,
  legacy-значение). **tests/progress.test.js**: тест дефолта/валидации
  updateProfile, миграция (дефолт/сохранено/фолбэк), import (принято/422).

Проверка: `scripts/verify.sh` → VERIFY OK (128 npm-тестов, smoke 8/200 на
:3917), grep ds-signal в exam.js пуст. Проблем: нет. Примечание: кодовый
коммит 8525999 из прошлого запуска был локальным (не запушен) — в этом
запуске задача дополнена тестами, закрыта и запушена.

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
