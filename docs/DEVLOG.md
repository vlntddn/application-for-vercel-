## 2026-09-29 08:19 — S2.7: Нижнее меню по дизайн-системе (components/Nav)

Что сделано:
- **public/styles.css** (.nav): нижняя навигация — фиксированная панель
  `bottom:0` + `safe-area-inset-bottom` (iOS), высота `var(--nav-h)` = 64px,
  тёмная граница сверху (компонент Nav). Подписи 12px (0.75rem), жирные,
  `text-transform: uppercase` (markup — обычный регистр ради переводов,
  дисплей — капс по дизайн-системе). Активная вкладка — фон `var(--ink)`
  + текст `var(--on-ink)` (было: hover жёлтый `--warn` + чёрный, active —
  `--paper`; жёлтый больше не в nav).
- **public/index.html**: 6 ссылок → 5 вкладок на телефоне (Home, Theory,
  Practice, Exam, Mistakes); Settings оставлен в DOM (desktop + aria),
  на ≤ 760px `.nav .nav-settings { display:none }` (grid 6→5 колонок).
  В шапке — `.settings-gear` (шестерёнка 24px, тап-зона 44×44px,
  `display:block` только на ≤ 760px, `.active` — ink/on-ink).
- **public/styles.css** (.nav-badge): счётчик открытых ошибок на вкладке
  Mistakes — красный `var(--bad)`, 18px, absolute в углу иконки
  (скрывается при 0 — main.js).
- **public/js/main.js**: маршрутизация шестерёнки — на телефоне Settings
  открывается/закрывается по шестерёнке (`.active` синхрон с роутом),
  бейдж Mistakes заполняется из progress (открытые ошибки).
- **public/js/views/practice.js / exam.js**: класс `body.in-session` на
  время сессии; `body.in-session .nav { display:none }` — панель уступает
  место карточке вопроса; `main` поднимает padding, чтобы контент не
  прятался под панелью (mobile).
- **public/styles.css** (фикс регрессии): шестерёнка `margin: -12px 0` —
  тап-зона остаётся 44×44, но шапка при этом не разрастается за 64px
  (padding 12 + иконка 44 = 68px → qa-ux p6 краснел на 11/22).
- **public/sw.js**: VERSION v47 → v48 (public/ менялся).

Почему: задача S2.7 закрывает пункт Nav дизайн-системы — 5 вкладок на
телефоне, Settings за шестерёнкой в шапке, активная — ink, скрыто в
практике/экзамене. Измеримый эффект — p3 (aria-current) + удобство (p7):
панель не конкурирует с карточкой на узком экране.

Проверка:
- scripts/verify.sh → VERIFY OK (84 теста, 8 smoke, qa-new-user 37/0).
- node scripts/qa-ux.mjs: **174 PASS / 2 FAIL** — ровно базовое состояние
  до S2.7 (база мерилась в worktree на cb06271: 174/2, единственный
  п7 next-steps 2/22 — зона S2.11). p3 (aria-current) 0/22 — Settings
  физически остался в #nav (скрыт CSS на ≤ 760px), data-route на месте.
  p6 (шапка ≤ 64px) 0/22 — после фикса margin шестерёнки; первый вариант
  кода дал p6 = 11/22 (шапка 68px), откат не требовался, починено в
  том же коммите.
- Вручную (headless через qa-ux): на 375px 5 вкладок, шестерёнка в шапке
  справа, в сессии `.nav` display:none.

НЕ тронуто: `.btn-true/.btn-false` (S2.8), данные/manifest, переводы
(подписи — sentence case в markup, i18n-ключи уже существуют).

---

## 2026-09-29 07:20 — S2.6: Кнопки по дизайн-системе (components/Button)

Что сделано:
- **public/styles.css** (.btn):
  - hover: было жёлтое `var(--warn)` + чёрный текст → `var(--surface-sunken)`
    + подъём `translate(-1px,-1px)` (правило Button: hover НЕ жёлтый, жёлтый = warning);
  - press: `box-shadow: 0 0 0 var(--ink)` → `box-shadow: none` (провал на 3px на тень);
  - primary hover: чёрный фон + белый текст → остаётся `var(--accent)`,
    текст `var(--on-accent)` (чёрный, 6.3:1) — только подъём;
  - disabled: opacity 0.35 → `surface-sunken` фон + `ink-muted` текст/граница,
    без тени (как `.ds-btn[disabled]`), поддерживается и `aria-disabled="true"`;
  - tap-target: `min-height/min-width: 44px` + `display:inline-flex; align/justify:center`
    (раньше 35–43px — все 22 вьюпорта p2 краснели на .btn);
  - transition добавлен background-color (60ms).
- **public/styles.css** (.btn:focus-visible): вынесен из общего правила
  input/select/nav/card → свой: `outline: 3px solid var(--focus)` (синий, 3px
  по компоненту Button); остальные элементы остались на `var(--accent)`.
- **public/styles.css** (.ds-notice__btn): min-height 40 → 44px (плашка S2.5
  краснела на p2 во всех 22 вьюпортах — та же проблема тап-зоны).
- **public/sw.js**: VERSION v46 → v47 (public/ менялся).

НЕ тронуто: `.btn-true/.btn-false` (VERO/FALSO) и их hover — зона S2.8
(ответы VERO/FALSO: «обе нейтральные до ответа»).

Почему: задача S2.6 закрывает пункт Button дизайн-системы — primary accent +
чёрный (уже было), hover без жёлтого, press-провал, фокус focus 3px,
min-размер кнопки. Измеримый эффект — p2 (touch targets ≥ 44px).

Проверка:
- scripts/verify.sh → VERIFY OK (84 теста, 8 smoke, qa-new-user 37/0).
- node scripts/qa-ux.mjs: p2 было 22/22 FAIL → **0/22 FAIL**; p5 осталось
  0/22; p7 (2/22, зона S2.11) без изменений; ИТОГО 152 PASS/24 FAIL →
  **174 PASS / 2 FAIL** (осталось только p7).

---

## 2026-09-29 06:05 — S2.5: Приватность без пути к файлу (плашка вместо футера)

Что сделано:
- **public/index.html**: футер `<footer class="footer"><p id="privacy-note">…
  storage/progress.json …</p></footer>` → `<div class="ds-notice"
  id="privacy-notice">`: SVG-иконка (info-circle, stroke=currentColor),
  текст «Your progress stays on this device.» (без пути к файлу) и кнопка
  «Got it» (#privacy-notice-ok). Вёрстка — в потоке документа, НЕ fixed.
- **public/styles.css**: новый блок `.ds-notice` (flex, иконка + текст +
  кнопка с margin-left:auto, 2px-граница ink на surface-sunken, как Callout
  из design-system) + `.ds-notice__btn` (min-height 40px, hover —
  surface-sunken, focus-visible — 3px var(--focus)); @760px — сузены
  отступы. Старые .footer-стили не тронуты (другие экраны их не используют,
  но удаление — лишний риск).
- **public/js/main.js**: IIFE `dismissPrivacyNoticeIfStored` в самом верху
  модуля: восстанавливает скрытие (localStorage `pp-privacy-notice=1`)
  до первого render'а (плашка не мигает) и вешает click на «Got it»
  (remove + setItem в try/catch — приватный режим). Работает и в серверном,
  и в офлайн-режиме (один индекс = одна плашка).
- **public/sw.js**: VERSION v45 → v46 (public/ менялся).

Почему: п.4 UX-аудита (qa-ux.mjs, «вредный текст») краснел — футер
дословно показывал путь storage/progress.json пользователю. Формулировка
«Your progress stays on this device.» — та же мысль, без пути к файлу;
кнопка «Got it» даёт постоянный dismiss (localStorage).

Важные решения:
- Инлайн-`<script>` для восстановления скрытия НЕ использован: CSP
  `script-src 'self'` (server/index.js + верcel.json) запрещает inline —
  тест security.test.js:109 провалился бы. Логика — в main.js.
- Старый тег «PROGRESS STAYS ON YOUR MACHINE» в шапке удалять НЕ пришлось:
  его уже заменил wordmark S2.4.

Проверка:
- `scripts/verify.sh` → VERIFY OK: zero deps, protected paths, sw bump,
  overlay, npm test 84 passed, smoke 8/8 200, qa-new-user 37 PASS 0 FAIL.
- grep по public/*.js и index.html: видимого «storage/progress.json» нет
  (осталось только в комментарии api.js — не рендерится).

---

## 2026-09-29 05:05 — S2.4: Шапка + Wordmark (компонент design-system «Passo»)

Что сделано:
- **public/index.html**: brand в .masthead → wordmark: `.brand__name`
  «Patente Pro» + акцентная квадратная точка `.brand__dot` (aria-hidden) +
  теглайн `.brand__tag` «Italian theory master». \<title\> → «Patente Pro»
  (sentence case, S2.3-паттерн). credits.html/privacy.html не тронуты
  (protected).
- **public/styles.css**:
  - .masthead: padding 16→12px, align-items flex-start (теглайн не тянет
    высоту у навигации).
  - .brand: колонка gap 4px; .brand__name: 900 32px/1 var(--font-sans),
    uppercase, letter-spacing -0.02em, цвет var(--ink) (НЕ accent —
    контраст 2.9:1, правило ds-tokens); .brand__dot: 0.3em×0.3em,
    background var(--accent), border 0.07em solid var(--ink);
    .brand__tag: 600 12px/16px var(--font-mono), uppercase, var(--ink-muted).
  - @760px: .masthead justify-center, padding 12px 16px; .brand__name
    22px (wordmark --sm из design-system).
  - @480px: .brand__tag display:none (роадмап: подзаголовок скрыть на ≤480px).
- **public/sw.js**: VERSION v43 → v45 (public/ менялся в двух коммитах).
- **public/js/views/settings.js:220** ('PATENTE PRO') — НЕ тронуто: это
  отдельная текстовая строка экрана настроек, не brand-компонент шапки
  (задача S2.4 = шапка + Wordmark; регистр текстов — зона S2.3).

Почему: п.6 UX-аудита (шапка ≤ 64px @375) краснел на 11/22 — старая
шапка 16px padding + 1.6rem brand + small-подпись. Wordmark по
docs/design-system/components/Wordmark (README + bundle.css): имя в ink,
второе слово НЕ оранжевым, квадрат-акцент после последнего символа.

Проверка:
- scripts/verify.sh → VERIFY OK (84 теста, 8 smoke, qa-new-user 37/0).
- node scripts/qa-ux.mjs → **p6 (header ≤ 64px @375) = 0/22 FAIL**
  (было 11/22); итог 146 PASS / 30 FAIL (было 135/41) — без отката.
- Замер headless Chrome: @375 шапка = 49px (имя 22px, теглайн скрыт),
  @1280 = 87px с видимым теглайном (p6 меряет только @375; высота
  десктоп-шапки при реорганации навигации — зона S2.7).
- Остальные FAIL (p2 touch targets, p4 «storage/» text, p7 next-steps) —
  чужие задачи S2.5/S2.6, не затронуты.

## 2026-09-29 04:10 — S2.3b: типографика — sentence case на оставшихся экранах

Что сделано:
- Sentence case для lede/подсказок/пустых нот/инлайн-лейблов на
  **dashboard, stats, search, theory, dictionary, install.js**. Правило:
  капс остаётся только у h1, h2-заголовков панелей, тегов и кнопок
  (подтверждено в ADOPTION.md).
  - dashboard: lede «Ready for the exam?…», empty-note слабых тем,
    stat-sub «Day(s) in a row» / «Of N (pct%)» / «mock exams passed».
  - stats: lede, все stat-sub (mastered, accuracy, exam success, weak
    spots, mock-exam trend), empty-note активности и слабых тем.
  - search: оба lede (loading + «All N questions…»), empty-note
    (мин. 3 символа / ничего не найдено).
  - theory: lede списка и глав, «IN THIS LESSON» objective (убран
    `.toUpperCase()`), stat-sub, feedback «Self-check: X/Y correct»,
    инлайн-лейблы «Translation —» / «In simple words —», «CHAPTER NOT
    FOUND», lede страницы «L'Italiano dell'esame».
  - dictionary: оба lede, «Tap to reveal» (term-veil), убран
    `.toUpperCase()` в описании секций.
  - install.js: три варианта lede (installed / iOS Safari / Chrome-Android)
    → sentence case.
- onboarding.js не трогался — переведён ещё в S2.3a.
- **Тесты приведены к case-insensitive** (иначе ломались после смены регистра):
  - tests/security.test.js:333 `/ADD TO HOME SCREEN/` → `/ADD TO HOME SCREEN/i`.
  - qa-new-user.mjs self-check: `includes('SELF-CHECK')` →
    `.toLowerCase().includes('self-check')` (в waitFor и в check).
- SW v42 → v43 (public/ поменялся).

Почему: цель S2.3b — весь фронт в едином регистре без отката qa-ux p4/p5.
Смена регистра текстов ломала 2 case-sensitive ассерта — их ослабили
(это уже устоявшийся паттерн: S2.3a тоже делал соседний `/i`).

Проверка:
- scripts/verify.sh → VERIFY OK (84 теста, 8 smoke, qa-new-user 37 PASS / 0 FAIL).
- node scripts/qa-ux.mjs → p5 (контраст) = 0 FAIL на всех экранах (без отката).
  Остались FAIL p2/p4/p6/p7 — чужие задачи S2.4 (header@91px), S2.5
  («storage/» text), S2.6 (кнопки) — не введённые моим изменением.

## 2026-09-29 03:05 — S2.3a: типографика — контраст p5 22/22 → 0, sentence case в ядре обучения

Что сделано:
- **Контраст (цель S2.3 «p5 ↓» достигнута: 22/22 → 0/22 FAIL).** Корень
  проблемы — S2.2 подтянул токены, но `--accent` (#ff4d00) использовался как
  ФОН с белым текстом (3.33:1) и как ТЕКСТ на `--paper` (3.33:1). Дизайн-система
  уже давала правильные токены, их просто не применяли:
  - accent как фон → чёрный текст `var(--on-accent)`: `.btn-primary`,
    `.footer code`, `.tag.accent-tag` (чёрный на #ff4d00 ≈ 7:1).
  - accent как текст → `var(--accent-ink)`: `.accent`, `.stat-value.accent`
    (было `var(--accent)`, 2.9:1), `.week-day.today .week-label`.
    В тёмной теме `--accent-ink: #ff7a3d` уже задан — обе темы зелёные.
- **Размеры по токенам:** метки меню/теги/буквы недели/footer/kbd-hint — 12px
  (0.75rem), lede/stat-sub/empty-note — body-sm 14/20 (0.875rem), h2 в
  `.card`/`.panel`/`.term-card`/`.term-row` — heading 1.25rem.
- **Регистр (правило Content fundamentals):** exam/practice/review — lede,
  правила экзамена («30 random questions…»), статусы («Saving result…»),
  подсказки и empty-note переведены в sentence case. Капс оставлен только у
  заголовков экранов, лейблов, тегов и кнопок.
- **QA:** в qa-new-user.mjs правила экзамена `/30 RANDOM QUESTIONS/`,
  `/20 MINUTES/`, `/3 ERRORS/` → добавлен флаг `/i` (как уже соседняя
  case-insensitive «это тренировка») — QA теперь проверяет регистронезависимо
  и соответствует design-intent.
- `public/sw.js`: VERSION v41 → v42.

Как проверялось:
- scripts/verify.sh — VERIFY OK: 84 теста, 8 smoke-эндпоинтов 200, zero deps,
  «public/ changed and sw.js VERSION bumped», qa-new-user 37 PASS / 0 FAIL.
- node scripts/qa-ux.mjs — **p5 контраст: 22/22 → 0/22 FAIL** (цель S2.3
  «p5 ↓» выполнена полностью, а не «заметно»). Остальные метрики на уровне
  базовой линии S2.1 (p4 22/22 «storage/» — задача S2.5, p2 6/22 — S2.6,
  p6 11/22 — S2.4).

Коммиты: 1f5ccbf (code + qa-new-user.mjs + sw.js), docs — текущий.

Замечание: задача S2.3 в роадмапе разбита на **S2.3a** (контраст + ядро
обучения, эта запись — ЗАКРЫТА) и **S2.3b** (sentence case в остальных
экранах: dashboard, theory, stats, search, dictionary, install.js, onboarding)
— остаётся открытой, берётся следующим запуском.

## 2026-09-29 02:12 — S2.2: токены дизайн-системы в public/styles.css, SW v40 → v41

Что сделано:
- В начале styles.css переписаны :root и [data-theme="dark"] по токенам из
  docs/design-system/tokens.json (Passo v1): цвета (paper/surface/surface-sunken/ink/
  ink-muted/line-soft/on-ink/accent/on-accent/accent-ink/accent-soft/ok/ok-soft/bad/
  bad-soft/warn/on-warn/warn-ink/warn-soft/focus/heat-0..4), spacing (--space-1..16),
  radius, shadow-sm/md, border-2/3, tap-min/nav-h/content-max, z-nav/z-overlay,
  --font-sans (стек без Onest — шрифт self-hostится в S2.13) и --font-mono.
  Тёмная тема получает только цветовые переопределения + тени, как в tokens.json.
- Старые имена (--muted, --border, --border-thin, --shadow, --shadow-small, --font)
  оставлены как алиасы на новые токены — все 72 использования в файле продолжают
  работать. --ok изменён #00a651 → #006b7a, --bad #e4002b → #b3002c (значения из
  tokens.json) — это осознанное изменение контраста.
- public/sw.js: VERSION v40 → v41 (правило: любое изменение public/ → bump).

Как проверялось:
- scripts/verify.sh — VERIFY OK: 84 теста, 8 smoke-эндпоинтов 200, zero deps,
  «public/ changed and sw.js VERSION bumped», qa-new-user 37/0.
- node scripts/qa-ux.mjs: ИТОГО 113 PASS / 63 FAIL (было 112/64) — p5 (контраст)
  поправился на @375, остался только на @1280 (span.accent/button.btn/code 3.33:1 —
  это --accent #ff4d00 на --paper #f4f1ea, 3.33:1 — значение из tokens.json.
  Дальнейший фикс — за задачами S2.3 (типографика) и S2.6 (кнопки: primary =
  accent + ЧЁРНЫЙ текст on-accent).
  Справедливость p4 (22/22 «storage/») не подтвердилась — задача S2.5 «Приватность без пути к файлу».

Коммит: ab8a6bd (code), docs — текущий.

# Журнал разработки

## 2026-09-29 01:40 — S2.1 (докраска черновика): qa-ux.mjs без дебага, базовая линия подтверждена

`qa-ux.mjs` из коммита 45ec756 остался «черновиком» с остатками отладки,
которую я добавил в сессии-дебаге. Убрал три места, поведение не менял:

- Дубль проверки «порт 3921 свободен» (стояла дважды до spawn) — оставил одну.
- `completeOnboarding`: диагностический ДИАГ-дамп с чужим
  `window.appReady` в сообщении об ошибке — на чистое сообщение.
- Обработчик CDP: лог `Runtime.exceptionThrown` (JS-ОШИБКА) — аудит
  меряет UX, а не JS-ошибки; вывод стал чище.

Проверка: `node scripts/qa-ux.mjs` → **112 PASS, 64 FAIL** (п1 0/22 · п2 7/22
· п3 0/22 · п4 22/22 · п5 22/22 · п6 11/22 · п7 2/22 · п8 0/22), код выхода 0
— базовая линия из 45ec756 воспроизведена в точности. `scripts/verify.sh` →
VERIFY OK.

Следующая задача — S2.2 (токены дизайн-системы в public/styles.css).

## 2026-09-29 00:40 — ВОПРОС: параллельный запуск self-improve, задача не взята

Запуск по протоколу роадмапа (lock → S1.12) прерван без правок кода.
Обнаружено:

- На старте дерево было чистым, lock-файла не было; я записал lock
  (epoch 1790633260). В течение минуты значение lock было перезаписано
  другим процессом (1790633269), и в репозитории появилось чужое
  незакоммиченное WIP (правки CLAUDE.md/AGENTS.md/ARCHITECTURE.html,
  новый файл qa-ux.mjs, правки settings.js/sw.js/qa-new-user.mjs).
- Параллельный агент (сессия Claude Code с `--add-dir
  /Users/valentind/my-project`) выполнил **S1.12** (коммит `bc86c85`),
  затем зафиксировал баг Settings (`71ce14b`) и запушил в
  `origin/self-improve`.
- Мой lock не защитил от параллельного запуска: значение файла
  перезаписывается, а не блокируется (нет O_EXCL/реестра PIDs).

Что сделано этим запуском: ничего, кроме этой записи (не трогал чужое
WIP, не коммитил и не пушил чужие файлы, lock чужого агента не удалял).

Гипотеза: два агента получили одинаковую инструкцию и работали
одновременно; протокол lock основан только на текстовом epoch и не
исключает race condition.

Вопрос владельцу: нужен ли жёсткий механизм блокировки (например,
`mkdir`-lock или `flock` на файле), чтобы self-improve-запуски не
пересекались? Пока ответа нет — следующие запуски должны проверять
`git status` до и после выбора задачи и не брать задачу, если дерево
не чистое.

## 2026-09-28 — S1.12: Итог Спринта 1 — разбивка завершена, доки обновлены

Что сделано:
- `wc -l public/js/views.js public/js/views/*.js` — максимальный файл
  449 строк (theory.js), все остальные ≤ 276, фасад `views.js` — 32 строки.
  Критерии спринта выполнены: ни один файл > 500, фасад ≤ 40, 84 теста
  зелёные, QA 25/25 (в verify).
- `CLAUDE.md`, секция «Где что лежит»: строка про `views.js` — все экраны —
  заменена на описание фасада + папки `views/` (список файлов экранов,
  правило «импорты из views.js не менять»).
- `AGENTS.md`: добавлена секция «Где что лежит» (такой секции не было —
  она есть только в CLAUDE.md): фасад views.js, домен, ui/state/api,
  доки, data/storage/legacy, bin — краткий список с теми же формулировками
  про фасад, что в CLAUDE.md.
- `docs/ARCHITECTURE.html`: проверен — пофайловых списков фронтенда в нём
  нет (только строка про `public/js/` в целом в таблице ответственности),
  менять нечего.

Почему: S1.12 — завершающая задача Спринта 1: зафиксировать результат
разбивки и довести документацию до актуального состояния структуры.

Как проверено: `wc -l` по файлам views; `scripts/verify.sh` → VERIFY OK
(zero-deps, protected paths, sw.js, overlay, npm test 84, smoke 8/8).
Спринт 1 закрыт целиком — следующая задача S2.1 (UX-аудит qa-ux.mjs).

## 2026-09-28 — S1.11c: mistakes и quick-review вынесены в views/review.js

Что сделано: из `public/js/views.js` (187 → 32 строки) в новый
`public/js/views/review.js` (155 строк) дословно перенесены
`renderMistakes`, `renderQuickReview` и константа `REVIEW_SIZE`.
В `views.js` — реэкспорт
`export { renderMistakes, renderQuickReview } from './views/review.js';`.
Импорты нового файла: `state`, `loadQuestions`, `slugForQuestionId`,
`shuffle` (state.js), `el`, `clear` (ui.js), `errorBanner`, `pickQueue`,
`categoryStats` (views/common.js), `renderQuizSession`
(views/practice.js — уже экспортируется, циклов нет: practice.js review.js
не импортирует). `main.js` не тронут: роуты `#/mistakes` и `#/review`
импортируют из views.js. Из фасада очищены все импорты, которые остались
без использования (`state`/`loadQuestions`/`slugForQuestionId`/`shuffle`
из state.js, `el`/`clear` из ui.js, `errorBanner`/`pickQueue`/`categoryStats`
из common.js) — `views.js` теперь чистый фасад из 9 реэкспортных секций.
`sw.js`: `SHELL` + `/js/views/review.js`, VERSION v38 → v39.

Почему: Спринт 1 — довести фасад до целевого размера ≤ 40 строк
(задача S1.11c, пропущенный хвост S1.11).

Как проверено: `node --check` по `views.js`, `review.js`, `sw.js`,
`main.js` — ок. `import('./public/js/views.js')` — падает только на
`window is not defined` (ожидание для браузерного модуля в Node).
`scripts/verify.sh` → VERIFY OK: zero-deps, protected paths, sw.js bump,
overlay, npm test 84, smoke 8/8, qa-new-user 25 PASS / 0 FAIL
(скрипт сам поднял сервер на :3919, прогресс владельца не задет;
после прогона порт :3917 свободен).

## 2026-09-28 — S1.11: экран Practice вынесен в views/practice.js

Что сделано: из `public/js/views.js` (440 → 187 строк) в новый
`public/js/views/practice.js` (266 строк) дословно перенесены `introQueue`,
`renderPracticeList`, `renderQuizSession`, `renderPracticeSession` и их
приватные хелперы/константы практики. В `views.js` на месте секции
PRACTICE — реэкспорт
`export { introQueue, renderPracticeList, renderQuizSession,
renderPracticeSession } from './views/practice.js';`.
В `main.js` изменения не вносились — роуты импортируют из views.js,
цепочка main.js → views.js → views/practice.js работает. После удаления
practice-блока из `views.js` очищены импорты, которые перестали
использоваться (`playCorrect`/`playWrong` из sound.js, `titleCase` из
ui.js, `loadLessons`/`recordAnswersResilient` из state.js,
`CATEGORY_CHAPTER` из theory-map.js, ряд имён из views/common.js) —
в фасаде остались только state.js, ui.js и views/common.js. `sw.js`:
`SHELL` + `/js/views/practice.js`, VERSION v37 → v38.

При переносе ловушка (пофиксено до коммита): секция PRACTICE в views.js
находилась ПЕРЕД секциями DASHBOARD и THEORY, и «дословный вынос»
забрал вместе с практикой и реэкспорты `renderDashboard`/`renderTheoryList`
— а в practice.js их относительные пути `./views/...` ломаются. Реэкспорты
DASHBOARD/THEORY возвращены в фасад views.js, в practice.js оставлены
только функции практики + `introQueue`. Проверка поименовано:
`node --check` всех трёх файлов, полный набор re-exports фасад =
оригинальный + practice.

Почему: Спринт 1 — разбить views.js на модули экранов, цель ≤ 500 строк
на файл. Practice — самый большой оставшийся экран (~550 строк); по факту
вынесся целиком, разрешённого разбиения S1.11a/b не понадобилось.

Как проверено: `node --check` — ок. `node qa-new-user.mjs` (Chrome
headless, сервер на :3000 с throwaway STORAGE_DIR — :3000 в момент
проверки был свободен, сервер владельца не тронут; после — сервер убит
по PID, порты :3000 и :3917 свободны) — 25 PASS, 0 FAIL (включая
«практика: 20 вопросов отвечены до конца сессии», «EASY START»,
self-check 5 вопросов). `scripts/verify.sh` → VERIFY OK (zero-deps,
protected paths, sw.js bump, overlay, npm test 84, smoke 8/8).
В `docs/TODO.md` отдельной строки по S1.11 нет — отметили только роадмап.

## 2026-09-28 — S1.10: экран Exam вынесен в views/exam.js

Что сделано: из `public/js/views.js` (635 → 440 строк) в новый
`public/js/views/exam.js` (194 строки) дословно перенесены
`renderExam` и её внутренний `runExam`. Вместе с функциями в заголовок
нового файла перенесены только константы экрана `EXAM_QUESTIONS = 30`,
`EXAM_SECONDS = 20 * 60`, `EXAM_MAX_ERRORS = 3` — они используются
исключительно этим экраном, в `views.js` после переноса не нужны. В
новый файл добавлены только импорты: `loadAllQuestions`,
`recordAnswersResilient`, `recordExamResilient`, `shuffle` (state.js);
`el`, `clear`, `fmtTime` (ui.js); `errorBanner`, `translationOf`,
`translationArea` (views/common.js). В `views.js` — реэкспорт
`export { renderExam } from './views/exam.js';` на месте секции EXAM.
В `main.js` изменения не вносились — роуты импортируют `renderExam`
из views.js, цепочка main.js → views.js → views/exam.js работает.
После удаления
exam-блока из `views.js` очищены импорты, которые перестали
использоваться: `api` (api.js), `applyTheme`, `loadTheory`,
`loadDictionary`, `loadAllQuestions`, `recordExamResilient`
(state.js), `fmtTime`, `fmtDate` (ui.js), `CHAPTER_CATEGORY`
(theory-map.js). `playCorrect`/`playWrong` (sound.js) оставлены —
ещё используются практикой (строка 161). `sw.js`:
`SHELL` + `/js/views/exam.js`, VERSION v36 → v37.

Почему: Спринт 1 — разбить views.js на модули экранов, цель ≤ 500
строк на файл. Exam — следующий по списку (S1.10).

Как проверено: `node --check` по `exam.js`, `views.js`, `sw.js` —
ок. `node qa-new-user.mjs` (сервер на :3000 с throwaway STORAGE_DIR,
Chrome headless) — 25 PASS, 0 FAIL (включая шаг «экзамен: таймер идёт
20:00 → 19:58»). `scripts/verify.sh` → VERIFY OK (zero-deps,
protected paths, sw.js bump, overlay, npm test 84, smoke 8/8).
Сервер убит по PID, порты :3000 и :3917 свободны, temp-файлы удалены.

## 2026-09-28 — S1.9: экран Theory вынесен в views/theory.js

Что сделано: из `public/js/views.js` (1081 → 635 строк) в новый
`public/js/views/theory.js` (449 строк) дословно перенесены
`renderTheoryList`, `renderTheoryChapter`, `renderExamItalian` и
внутренний `showSignModal` (модалка карточки знака) вместе с их
приватными хелперами (`close`, `draw`, `escHandler`, `keyHandler`,
`markRead`, `startCheck`). В новый файл добавлены только импорты:
`api` (api.js), `state`/загрузчики (state.js), `el`/`clear` (ui.js),
`CHAPTER_CATEGORY` (theory-map.js), `translationOf`/`lang`/`loc`/
`pickQueue`/`masteryOf`/`errorBanner` (views/common.js), и
`renderQuizSession` — обратно из `views.js`. В `views.js` — реэкспорт
`export { renderTheoryList, renderTheoryChapter, renderExamItalian }
from './views/theory.js';` на строке 61 (место секции THEORY,
`showSignModal` не реэкспортируется — используется только внутри
theory.js). `main.js` не тронут — роуты импортируют из views.js,
цепочка main.js → views.js → views/theory.js работает. Константы
`EXAM_*` в блок theory не входят, дублировать не пришлось. `sw.js`:
`SHELL` + `/js/views/theory.js`, VERSION v35 → v36.

Почему: Спринт 1 — разбить views.js на модули экранов, цель ≤ 500 строк
на файл. Theory — следующий по списку (S1.9).

Как проверено: сравнение тел всех 4 перенесённых функций против
`git show HEAD:public/js/views.js` — идентичны побайтово
(дословный перенос); цикл модулей views.js ↔ views/theory.js
проверен ESM-скриптом: импорт theory.js не падает (нет TDZ —
`renderQuizSession` в views.js это hoisted function declaration,
тот же паттерн, что в существующем цикле views.js ↔ views/search.js),
функции живые и едины по ссылке через реэкспорт;
`node --check` на `views.js`, `views/theory.js`, `sw.js` — без
ошибок; `scripts/verify.sh` → VERIFY OK (84 теста, 8 endpoints 200
на :3917, check «public/ changed and sw.js VERSION bumped» — PASS).
`node qa-new-user.mjs` не выполнен: сценарий хардкодит :3000 (порт
сервера владельца), протокол запрещает — фолбэк-проверка через
`npm test` (84 pass).

---

Хронология ключевых решений. Новые записи — сверху.

## Дизайн-система «Passo» в репозитории, Спринт 2 по ней; qa-ux.mjs работает; атомарный lock (2026-09-29)

1. Дизайн-система владельца (артефакт claude.ai, собрана в Cowork по
   Patente Pro) выгружена в `docs/design-system/` (38 файлов: бренд-бук,
   tokens.json, аудит 14 проблем, 15 компонентов с README + preview,
   bundle.css). `ADOPTION.md` — как применять тут: без внешних шрифтов,
   без innerHTML, имя остаётся Patente Pro, объяснения не выдумывать,
   конфетти Фазы 2.3 — на решение владельца (система запрещает). Спринт 2
   роадмапа переписан под компоненты системы (S2.2–S2.15).
2. `scripts/qa-ux.mjs` (черновик агента, 3 запуска подряд падали по
   таймауту 30 мин): баг — проверка «порт свободен» шла ПОСЛЕ запуска
   своего сервера на том же порту → всегда «порт занят». Проверка
   перенесена до запуска, порт 3921 (3917 — verify, 3919 — qa-new-user),
   Chrome гасится при любой ошибке. Базовая линия: 112 PASS, 64 FAIL.
3. Два запуска агента в 00:40 шли параллельно: текстовый lock
   (запись epoch в файл) не атомарен. Промт automation переведён на
   `mkdir …/self-improve.lockdir` (создаёт только один процесс), stale > 55 мин.

## FIX: Settings не открывался после S1.3 + проверка всех экранов в QA (2026-09-29)

Что случилось: при переносе экрана настроек в views/settings.js (S1.3)
потерялась константа `DAILY_GOAL_CHOICES` — `#/settings` падал с
ReferenceError, кнопка SETTINGS «не нажималась». Баг ушёл в прод (main
672dd45), владелец заметил вручную. npm test и qa-new-user его не ловили:
ни один не открывал экран настроек.

Исправлено: константа восстановлена в settings.js (значения из исходного
views.js), SW v39 → v40. Защита: qa-new-user.mjs слушает
Runtime.exceptionThrown весь прогон и в конце открывает все 11 экранов —
любая JS-ошибка = FAIL (до фикса: 2 FAIL ровно на этом баге, после: 37/37).
Статическая сверка всех views/*.js с исходным views.js — других потерянных
имён нет.

Процесс: запуск S1.12 не запушил коммит и начал S2.1 в том же запуске
(незакоммиченный qa-ux.mjs, 392 строки) — нарушение «одна задача за запуск».
Файл перенесён в /Users/valentind/my-project/.agent_automation/wip/qa-ux.mjs,
S2.1 начинать заново (можно взять его за основу).

## Ревью Спринта 1 + qa-new-user на изолированном сервере (2026-09-28)

Ревью работы исполнителя (S1.1–S1.11, 20 коммитов): views.js 2133 → 187 строк,
10 модулей в public/js/views/, ни одного ВОПРОСа, всё запушено;
`qa-new-user.mjs` после рефакторинга — 25 PASS, 0 FAIL.

Найдено и исправлено: `qa-new-user.mjs` был захардкожен на :3000 и делал
`DELETE /api/progress` — на машине владельца это стёрло бы его прогресс, а
агент в половине запусков пропускал сценарий. Теперь сценарий по умолчанию
поднимает свой сервер на :3919 с временным STORAGE_DIR и гасит его в конце
(`QA_URL=...` — явный прогон по чужому серверу). `scripts/verify.sh` при
правке public/ сам запускает сценарий (если есть Chrome) — пропустить его
нельзя. В роадмап добавлена пропущенная задача S1.11c: renderMistakes и
renderQuickReview остались в views.js.

## 2026-09-28 — S1.8: экран Dashboard вынесен в views/dashboard.js

Что сделано: из `public/js/views.js` (1276 → 1081 строк) в новый
`public/js/views/dashboard.js` (207 строк) дословно перенесён блок
125–321: `progressRing` (SVG-кольцо дневной цели), `nextStepsPanel`
(подсказка новичку до первого ответа), `weakSpotsPanel` (слабые темы
после экзамена) и `renderDashboard`. Приватные хелперы экрана —
`progressRing`, `nextStepsPanel`, `weakSpotsPanel` — ушли вместе с ним
и стали `export`. Константы `EXAM_QUESTIONS`/`EXAM_SECONDS`/`EXAM_MAX_ERRORS`
остались в `views.js` (их используют ещё `renderExam`); в `dashboard.js`
добавлены копии теми же значениями + `REVIEW_SIZE = 10` (в `views.js` она
была объявлена на строке 982, ниже dashboard, — «поднимать» её вверх
в views.js было нельзя, чтобы перенос оставался дословным).
В `views.js` — реэкспорт `export { renderDashboard } from
'./views/dashboard.js';`, удалён импорт `dayKey`/`weekStrip` (использовались
только dashboard); `main.js` не тронут. В новый файл добавлены только
импорты: `state` (state.js), `el`/`clear`/`fmtDate`/`titleCase` (ui.js),
`dailyGoal`/`categoryStats`/`PRACTICE_BATCH` (views/common.js),
`dayKey`/`weekStrip` (views/stats.js). `sw.js`: `SHELL` +
`/js/views/dashboard.js`, VERSION v34 → v35.

Почему: Спринт 1 — разбить views.js на модули экранов, цель ≤ 500 строк
на файл. Dashboard — следующий по списку (S1.8).

Как проверено: diff перенесённого блока против `git show HEAD:` —
только добавленные `export`-ключевые слова и локальные константы
(дословный перенос); `node --check` на `views.js`, `dashboard.js`,
`sw.js` — без ошибок; `import('./public/js/views.js')` падает только
на `window` (как и на HEAD — ожидаемо вне браузера);
`scripts/verify.sh` → VERIFY OK (84 теста, 8 endpoints 200 на :3917).
`node qa-new-user.mjs` не выполнен: сценарий хардкодит :3000 (порт
сервера владельца), протокол запрещает — фолбэк-проверка через
`npm test` (84 pass).

## 2026-09-28 — S1.7: экран Onboarding вынесен в views/onboarding.js

Что сделано: из `public/js/views.js` (1375 → 1276 строк) в новый
`public/js/views/onboarding.js` (104 строки) дословно перенесён блок
121–221: константа `ONBOARDING_STEPS` и `renderOnboarding` (3 слайда
первого запуска: экзамен → методика → приватность, сбор имени и языка).
Приватных хелперов у экрана нет — только замыкания внутри `draw()`.
В `views.js` — реэкспорт `export { renderOnboarding } from
'./views/onboarding.js';`, `main.js` не тронут. В новый файл добавлены
только импорты: `api` (api.js), `state` (state.js), `el`/`clear`
(ui.js), `errorBanner` (views/common.js). `sw.js`: `SHELL` +
`/js/views/onboarding.js`, VERSION v33 → v34.

Почему: Спринт 1 — разбить views.js на модули экранов, цель ≤ 500 строк
на файл. Onboarding — следующий по списку (S1.7), простой автономный
экран без зависимости от quiz-машины.

Как проверено: diff перенесённого блока против `git show HEAD:` — пуст
(дословный перенос); `node --check` на `views.js`, `onboarding.js`,
`sw.js` — без ошибок; `import('./public/js/views.js')` падает только на
`window` (как и на HEAD — ожидаемо); `scripts/verify.sh` → VERIFY OK
(84 теста, 8 endpoints 200 на :3917). `node qa-new-user.mjs` не
выполнен: сценарий хардкодит :3000 (порт сервера владельца), протокол
запрещает — фолбэк-проверка через `npm test` (84 pass).
## 2026-09-28 — S1.7: экран Onboarding вынесен в views/onboarding.js

Что сделано: из `public/js/views.js` (1375 → 1276 строк) в новый
`public/js/views/onboarding.js` (104 строки) дословно перенесён блок
121–221: константа `ONBOARDING_STEPS` и `renderOnboarding` (3 слайда
первого запуска: экзамен → методика → приватность, сбор имени и языка).
Приватных хелперов у экрана нет — только замыкания внутри `draw()`.
В `views.js` — реэкспорт `export { renderOnboarding } from
'./views/onboarding.js';`, `main.js` не тронут. В новый файл добавлены
только импорты: `api` (api.js), `state` (state.js), `el`/`clear`
(ui.js), `errorBanner` (views/common.js). `sw.js`: `SHELL` +
`/js/views/onboarding.js`, VERSION v33 → v34.

Почему: Спринт 1 — разбить views.js на модули экранов, цель ≤ 500 строк
на файл. Onboarding — следующий по списку (S1.7), простой автономный
экран без зависимости от quiz-машины.

Как проверено: diff перенесённого блока против `git show HEAD:` — пуст
(дословный перенос); `node --check` на `views.js`, `onboarding.js`,
`sw.js` — без ошибок; `import('./public/js/views.js')` падает только на
`window` (как и на HEAD — ожидаемо); `scripts/verify.sh` → VERIFY OK
(84 теста, 8 endpoints 200 на :3917). `node qa-new-user.mjs` не
выполнен: сценарий хардкодит :3000 (порт сервера владельца), протокол
запрещает — фолбэк-проверка через `npm test` (84 pass).

## 2026-09-28 — S1.6: экран Статистика вынесен в views/stats.js

Что сделано: из `public/js/views.js` (1636 → 1375 строк) в новый
`public/js/views/stats.js` (277 строк) дословно перенесены два блока:
1) `dayKey`, `weekStrip`, `HEAT_DAYS`/`HEAT_BANDS`/`HEAT_MONTHS`,
`heatLevel`, `activityHeatmap` (использовались dashboard и stats);
2) `renderStats` (секция STATISTICS). В `views.js` —
`import { dayKey, weekStrip } from './views/stats.js'` и реэкспорт
`export { renderStats } from './views/stats.js';`, `main.js` не тронут.
В `stats.js` добавлены только то, чего в блоках не было: `export`
у `dayKey`/`weekStrip`, импорты (`state`, `el`/`clear`/`titleCase`
из `ui.js`, `categoryStats` из `views/common.js`) и локальная
константа `EXAM_MAX_ERRORS = 3` (значением и определением
идентична той, что осталась в `views.js` и нужна там же).
`sw.js`: `SHELL` + `/js/views/stats.js`, VERSION v32 → v33.

Почему: Спринт 1 — разбить views.js на модули экранов, цель ≤ 500 строк
на файл. Stats — следующий по списку (S1.6); heatmap-хелперы ушли
вместе, потому что `renderDashboard` закрывается на них и у stats.js
не должно быть обратной зависимости на views.js.

Как проверено: все строки `stats.js` (кроме импортов/`export`/константы)
присутствуют дословно в `git show HEAD:public/js/views.js`;
`node --check` на `views.js`, `views/stats.js`, `sw.js` — без ошибок;
`import('./public/js/views.js')` падает только на `window` (как и на
HEAD — ожидаемо); `scripts/verify.sh` → VERIFY OK (84 теста, 8
endpoints 200 на :3917). `node qa-new-user.mjs` не выполнен: сценарий
хардкодит :3000 (порт сервера владельца), протокол запрещает —
фолбэк-проверка через `npm test` (84 pass).

## 2026-09-28 — S1.5: экран Словарь вынесен в views/dictionary.js

Что сделано: из `public/js/views.js` (1700 → 1636 строк) в новый
`public/js/views/dictionary.js` (71 строка) дословно перенесён блок
1067–1132: `renderDictionary` (приватные хелперы `termRow` и `draw`
замыкаются на неё, внешние не нужны). Импорт в новый файл:
`loadDictionary` из `state.js`, `el`/`clear` из `ui.js`,
`errorBanner`/`lang` из `views/common.js`. В `views.js` —
`export { renderDictionary } from './views/dictionary.js';`, `main.js`
не тронут. `sw.js`: `SHELL` + `/js/views/dictionary.js`, VERSION v31 → v32.

Почему: Спринт 1 — разбить views.js на модули экранов, цель ≤ 500 строк
на файл. Dictionary — следующий по списку (S1.5): одна функция, без
приватных констант.

Как проверено: diff перенесённого блока против `git show HEAD:` — пуст
(дословный перенос); `node --check` на `views.js`, `views/dictionary.js`,
`sw.js` — без ошибок; `import('./public/js/views.js')` падает только на
`window` (браузерный глобал, как и на HEAD — ожидаемо);
`scripts/verify.sh` — VERIFY OK (84 теста, 8 endpoints). `node
qa-new-user.mjs` не выполнен: сценарий хардкодит :3000 (порт сервера
владельца), протокол запрещает сервер для ручной проверки на портах,
кроме :3917 — фолбэк-проверка через verify/npm test.

## 2026-09-28 — S1.4: экран Search вынесен в views/search.js

Что сделано: из `public/js/views.js` (1807 → 1700 строк) в новый
`public/js/views/search.js` (114 строк) дословно перенесён блок
1507–1613: `renderSearch` + приватный хелпер `fold`. В `views.js` —
`export { renderSearch } from './views/search.js';`, `main.js` не тронут.
Константа `PRACTICE_BATCH` (используется `views.js` и `search.js`)
перенесена в `views/common.js` с `export`; оба файла импортируют её
оттуда — `search.js` не зависит от `views.js` через неё.
`sw.js`: `SHELL` + `/js/views/search.js`, `VERSION` v30 → v31.

Почему: Спринт 1 — разбить views.js на модули экранов, цель ≤ 500 строк
на файл. Search — следующий по списку простой экран (один приватный
хелпер).

Как проверено: diff перенесённого блока против `git show HEAD:` — пуст
(дословный перенос); `node --check` на `views.js`, `views/search.js`,
`views/common.js`, `sw.js` — без ошибок; verify OK (84 теста, 8
endpoints). `node qa-new-user.mjs` не выполнен: сценарий требует
сервер на :3000 (сервер владельца), трогать запрещено — по
разрешению задачи выполнена фолбэк-проверка `node --test` →
84 pass / 0 fail.

## 2026-09-28 — S1.3: экран Настройки вынесен в views/settings.js

Что сделано: из `public/js/views.js` (2049 → 1810 строк) в новый
`public/js/views/settings.js` (248 строк) дословно перенесён блок
1811–2049: `renderSettings` + приватные хелперы `showStorageStatus`,
`exportProgress`, `importProgressFile`, `downloadForOffline` и
`DAILY_GOAL_CHOICES`. В `views.js` — `export { renderSettings } from
'./views/settings.js';`, `main.js` не тронут. Из `views.js` удалены
теперь лишние импорты (`requestPersistentStorage`, `renderInstallPanel`,
`DAILY_GOAL_DEFAULT`) и константа `DAILY_GOAL_CHOICES`. `sw.js`:
`SHELL` + `/js/views/settings.js`, `VERSION` v29 → v30.

Почему: Спринт 1 — разбить views.js на модули экранов, цель ≤ 500 строк
на файл. Настройки — самый простой экран (нет привязки к quiz-машинам).

Как проверено: diff перенесённого блока против `git show HEAD:` — пуст
(перенос дословный); `npm test` 84/84; QA-сценарий нового пользователя
прогнан headless Chrome на :3917 с временным STORAGE_DIR — 25/25 PASS
(скриншоты в /tmp); `scripts/verify.sh` — VERIFY OK (6/6 гейтов).
Временный сервер остановлен, порт 3917 свободен.

## 2026-09-28 — S1.2: общие хелперы вынесены в views/common.js

Что сделано: из `public/js/views.js` (2133 → 2049 строк) в новый
`public/js/views/common.js` перенесены неэкспортируемые функции,
используемые ≥2 экранами: `dailyGoal`, `errorBanner`, `lang`,
`translationOf`, `loc`, `queueOrder`, `pickQueue`, `masteryOf`,
`categoryStats`, `translationArea` — все с `export`. В `views.js` —
`import { ... } from './views/common.js'`. `sw.js`: `'/js/views/common.js'`
добавлен в SHELL, VERSION v28 → v29. Перенос чистый: тела функций
скопированы дословно, поведение не менялось.

Почему: Спринт 1, шаг 2 — подготовка к разбиению views.js на модули
экранов: общий код должен жить в одном месте, чтобы экраны импортировали
его одинаково.

Как проверено: `import('./public/js/views/common.js')` — 10 экспортов;
`import('./public/js/views.js')` падает только на `window` (как и на HEAD —
браузерный глобал, ожидаемо); `npm test` 84/84; `scripts/verify.sh` —
VERIFY OK (zero deps, protected paths, sw bump, overlay, smoke 8/8).

## 2026-09-28 — S1.1: security-тесты не зависят от одного файла

Что сделано: в `tests/security.test.js` добавлен хелпер `readViewsSource()` —
склеивает `public/js/views.js` + все `public/js/views/*.js` (если папка есть);
4 source-text-теста (онбординг, pre-start экзамена, дашборд, install-панель)
теперь читают исходники через него. Код приложения не трогался.

Почему: шаг 1 Спринта 1 (разбиение views.js на модули экранов) — без этого
тесты ломались бы на любом переносе экрана в отдельный файл.

Как проверено: `node --test tests/security.test.js` — 21/21; `scripts/verify.sh`
— VERIFY OK (84/84). Логика склейки отдельно проверена на временной копии,
где views.js разрезан на два файла — оба маркера найдены.

## Роадмап для OpenHands + гейт scripts/verify.sh (2026-09-28)

Что сделано: аудит репозитория и план для автономного исполнителя (Qwen 3.8 /
DeepSeek V4 Flash) — `docs/OPENHANDS-ROADMAP.md`: протокол запуска (одна задача,
≤20 мин, 2 попытки → откат + ВОПРОС), спринты 0–4 (1 — разбиение views.js на
модули экранов, 2 — Фаза 2.3 атомарными задачами, 3 — словарь), вопросы
владельцу В1–В4, готовый промт automation. Новый `scripts/verify.sh` — один
гейт перед коммитом: ноль зависимостей, нетронутые data/questions + legacy +
лицензия, bump VERSION в sw.js при правке public/, ни одна запись overlay
(id × язык) не потеряна относительно HEAD, npm test, smoke 8 эндпоинтов на
изолированном порту 3917 со временным STORAGE_DIR (сервер на :3000 не трогается).

Почему: прошлые сбои automation — таймауты, перезапись overlay с потерей
данных, дублирующиеся коммиты. Слабой модели нужен механический
«зелёный/красный» сигнал, а не чек-лист на совесть.

Как проверено: на текущем дереве VERIFY OK (84/84); на копии с подложенными
поломками (правка data/questions, правка public/ без bump, удалённая запись
overlay) — все 4 нарушения пойманы, exit 1.
## 2026-09-28 — RU вычитка: distanza-di-sicurezza (50/135 вопросов)
- этот запуск: +20 вопросов, 20 правок
- термины по словарю: distanza di sicurezza=безопасная дистанция, spazio di frenatura=тормозной путь, aderenza=сцепление с дорогой, pneumatici=шины, limite di velocità=ограничение скорости, corsia=полоса движения; убраны кальки (commisurata=определять с учётом, è una distanza fissa=величина непостоянная)

## 2026-09-28 — RU вычитка: distanza-di-sicurezza (30/135 вопросов)
- этот запуск: +20 вопросов, 20 правок
- термины по словарю: distanza di sicurezza=безопасная дистанция, veicolo=транспортное средство, carreggiata=проезжая часть, pneumatici=шины, freno/t=тормоза, carico=груз; убраны кальки (commisurare=подбирать, sgombraneve=снегоуборочная машина, spanditrice di sale=машина для распыления соли)

## 2026-09-28 — RU вычитка: consumi-ambiente-inquinamento (103/103 вопросов)
- этот запуск: +19 вопросов (последняя пачка, категория закрыта на 100%), 19 правок
- термины по словарю: veicolo=транспортное средство, carreggiata=проезжая часть, rimorchio=прицеп, marmitta=глушитель; «tettuccio»=люк на крыше, «zone residenziali»=жилые зоны

## 2026-09-28 — RU вычитка: consumi-ambiente-inquinamento (80/103 вопросов)
- этот запуск: +20 вопросов, 20 правок
- единый шаблон «Загрязнение воздуха, вызванное транспортными средствами» (veicoli=транспортные средства по словарю); GPL=сжиженный газ, «cambio in folle»=коробка в нейтральном положении, «colpo di acceleratore»=коротко нажать педаль акселератора


## 2026-09-28 — RU вычитка: consumi-ambiente-inquinamento (64/103 вопросов)
- этот запуск: +20 вопросов, 20 правок
- термины приведены к словарю: veicolo=транспортное средство, inquinamento=загрязнение окружающей среды, marcia bassa=пониженная передача; убраны кальки (clacson=звуковой сигнал, strisciamento=проскальзывание, rendimento=эффективность)


## 2026-09-28 — RU вычитка: consumi-ambiente-inquinamento (64/103 вопросов)
- этот запуск: +20 вопросов, 20 правок
- термины приведены к словарю: veicolo=транспортное средство, inquinamento=загрязнение окружающей среды, marcia bassa=пониженная передача; убраны кальки (clacson=звуковой сигнал, strisciamento=проскальзывание, rendimento=эффективность)

## Overlay-вычитка RU категории incidenti-stradali-comportamenti — продолжение (2026-09-28)

Что сделано: вторая волна ревью той же категории (после первого прохода
на 70 вопросов ниже) — overlay расширен ещё на 29 вопросов группами
causa-probabile-incidenti (0–5, 8–12), caso-pioggia (1, 3, 7),
strade-coperte-neve-5, aquaplanning (3, 4), tratti-strada-ghiacciati
(2, 3, 7–9), nebbia-fitta (7, 8, 10). Итого overlay категории теперь
покрывает 82 вопроса. Из новых 29: 28 реально отличаются от банка,
1 совпал и оставлен для единообразия структуры
(obblighi-dopo-incidente-stradale-10). Только RU, en/zh этой категории
не трогались (как и в первом проходе).

Важное исправление процесса: промежуточный автономный запуск
(self-improve automation) при добавлении этих 29 вопросов случайно
перезаписал файл overlay целиком и потерял en/zh у 26 уже
исправленных вопросов первого прохода + вообще удалил 12 записей
(aquaplanning-1/2/8, caso-pioggia-2/5/6, strade-coperte-neve-2/3/7,
tratti-strada-ghiacciati-1/5/10). Восстановлено вручную слиянием
старой (закоммиченной) и новой версий файла — ни один язык/вопрос из
первого прохода не потерян, все 29 новых сохранены. npm test 84/84
после слияния. Причина закладывается в промт лупа: он не сверял
существующий overlay-файл с git HEAD перед перезаписью — промт лупа
обновлён (батчи по 20 вопросов, явный запрет перезаписи чужих id).

## Overlay-вычитка RU категории incidenti-stradali-comportamenti (2026-09-28)

Что сделано: первый реальный overlay перевода Фазы 2.1 —
`data/translations/incidenti-stradali-comportamenti.json` (категория
на 102 вопроса; overlay несёт RU-переводы 70 вопросов, из них 68
действительно отличаются от банка — 2 совпали и оставлены для
единообразия структуры: obblighi-dopo-incidente-stradale-10,
tamponamenti-stradali-3). Только RU — по правилу «не больше одной
категории/языка за запуск»; en/zh этой категории в этом запуске не
трогались. Bank `data/questions/*` не тронут (read-only); фронтенд
налагает overlay поверх банка (state.js), сервер раздаёт
`/data/translations/*` существующим маршрутом. VERSION в sw.js
v25 → v26 (DATA_CACHE).

Что исправлялось (все сверено с text_it поштучно):
1. Калька «особенности конструкции/строения дороги» (ит.
   «struttura della strada») — группа causa-probabile-incidenti:
   единое естественное «из-за структуры дороги» во всех 13 вопросах
   группы + согласованная конструкция «Вероятной причиной аварий …
   может быть …».
2. Термины, искажающие смысл: «одностороннее движение» →
   «проезжая часть с односторонним движением» (causa-probabile-8:
   carreggiata a senso unico), «отсутствие сигнала на перекрёстках»
   → «отсутствие сигнальных знаков» (-1: segnaletica),
   «гидроусилителем рулевого управления» → «с гидроусилителем руля»
   (tamponamenti-4), «смазочного масла» → «масла»
   (obblighi-11: spia dell'olio).
3. Естественность/порядок слов: «В случае дождя» → «В дождь»,
   «В случае густого тумана» → «В густом тумане» (весь блок
   nebbia-fitta + caso-pioggia), «на низкой скорости» → «на малой
   скорости» (aquaplanning-3), «подъезжать» → «ехать»
   (ghiacciati-7), «включенным» → «включённым», орфография
   (перекрёстках, плёнкой, ребёнка, включённым).
4. Числа и смысл НЕ менялись: VERO/FALSO всех вопросов сохранён;
   фактологические «ловушки» вопросов (фальшивые советы типа «резко
   тормозить», «накрыть полиэтиленом», «оставить указатель поворота»)
   переведены ровно как ложный совет — без «исправления» на
   правильный ответ.

Как проверено: (1) построчный diff overlay против банка с text_it
рядом — 70 записей просмотрены; (2) audit-тесты в npm test
проходят (полнота en/ru/zh по банку, длины, валидность overlay —
только существующие id, без языка-источника it); (3) `npm test`
84/84; (4) smoke на свежем `node server/index.js`: 9 эндпоинтов
включая `/data/translations/incidenti-stradali-comportamenti.json` —
все 200; сервер убит по точному PID, порт 3000 свободен
(`lsof -ti :3000` — пусто).

## Аудит согласованности переводов en/ru/zh в npm test (2026-09-28)

Что сделано: закрыта подзадача Фазы 2.1 «Аудит» — новый файл
`tests/translations-audit.test.js` с 5 тестами, автоматически выполняется
`npm test` (84/84 после добавления). Проверяет банк (7139 вопросов, 25
категорий): (1) каждый вопрос имеет непустой `text` в en, ru, zh;
(2) длины в пределах границ — ≤ 400 для всех, минимум en ≥ 20, ru ≥ 15,
zh ≥ 6; (3) нет дословных дублей text_it; (4) `data/manifest.json`
сходится с файлами банка (totalQuestions и счётчики категорий);
(5) overlay-файлы `data/translations/*.json` (их пока нет) проходят те же
проверки: валидный JSON, только существующие id вопросов, не несёт
язык-источник "it", те же границы длины. Все нарушения выводятся списком
(первые 20 + счётчик), а не только первое — красный прогон сразу
действенный.

Почему пороги такие, а не «20–400» из задачи: измерено по банку —
коротейший законный полный перевод en ровно 20 символов, у ru один
полный перевод на 17 («Автобус не машина»), у zh плотный язык и
полные переводы от 6 символов («车道是停车场») — единый порог 20 для
всех дал бы 3117 ложных срабатываний только по zh. Порог ловит
обрезанные/сломанные фрагменты, а не требует «нормальной длины
предложения».

Как проверено: `npm test` 84/84 (было 79); отрицательная проверка —
временный `data/translations/sorpasso.json` с обрезанным ru-переводом (7
символов) и несуществующим id — тест упал с точным сообщением
(`too short (7 < 15)`, `unknown question id`), файл удалён, повторный
прогон зелёный; smoke на сервере владельца (:3000, pid 22883 — трогать
не стал) — все 8 эндпоинтов 200.

## QA-сценарий нового пользователя пройден: 25/25 PASS (2026-09-28)

Что сделано: закрыта единственная незакрытая задача ТЕКУЩЕГО ПРИОРИТЕТА
(Фаза 2.2). Сценарий теперь прогоняется автоматически:
`qa-new-user.mjs` — headless Chrome через CDP (порт 9333), чистый профиль
сбрасывается через `DELETE /api/progress` до старта.

Путь, который проходит скрипт (как в задаче TODO):
онбординг (3 слайса) → дашборд → практика (новичку — EASY START,
сессия доиграна до конца до экрана SESSION COMPLETE) → теория ch1
(пометка «прочитано» + self-check из 5 вопросов) → экзамен: пре-старт
(честная строка «это тренировка», 30/20/3), таймер проверен живым,
покинут без завершения → закрытие и повторное открытие: онбординг НЕ
повторяется, профиль и ответы сохранены (persist: 25 ответов, read: ch1).

Каждый экран при этом проверяется на объяснительный lede-текст
(зачем страница существует) — 9 таких проверок.

Проблемы, найденные и устранённые в самом сценарии (не в приложении):
1. Практика — сессия на 20 вопросов (PRACTICE_BATCH), FINISH и
   SESSION COMPLETE — только после 20-го вопроса. Раньше скрипт
   отвечал 5 и ждал результата — ложный FAIL. `practiceRound()`
   переписан: доигрывает текущую сессию до конца (макс. 25 шагов,
   защита от зацикливания; успех, если `.question-card` исчез).
2. After-reload: после перезапуска hash остаётся `#/exam`, приложение
   честно показывает пре-старт экзамена, а не дашборд — ассерт
   поправлен на ожидание пре-старта (поведение приложения корректно).
3. `answers` в `/api/progress` — объект `{slug: {correct, wrong, ...}}`,
   а не массив: `(after.answers || {}).length` всегда `undefined`,
   посчитал через `Object.keys`.

Проверено: `npm test` 79/79; smoke на уже работающем сервере :3000 —
все 8 эндпоинтов 200 (сервер трогать не стал: поднят в сессии
владельца, uptime ~20 мин до прогона); прогон 2026-09-28
(`/tmp/pp-qa-run14.log`): 25 PASS, 0 FAIL; после прогона storage
сброшен в чистый профиль; незакоммиченных изменений в application-коде
нет (единственный новый файл — сам `qa-new-user.mjs`).

## ВОПРОС: 2026-09-28 — QA-сценарий нового пользователя: владелец уже работает над ним вручную
Контекст: единственная незакрытая задача ТЕКУЩЕГО ПРИОРИТЕТА (Фаза 2.2) —
QA-сценарий нового пользователя (онбординг → практика 20 → теория ch1 →
self-check → экзамен 5 минут → повторное открытие). Всё остальное в Фазе
2.2 уже закрыто и закоммичено в self-improve (онбординг, lede на всех
экранах, первый заведомый успех, экран перед экзаменом, пустые состояния).

Во время запуска 2026-09-28 04:55–05:33 (lock-автоматизация self-improve)
в репозитории параллельно шёл **живой отладочный прогон этого же сценария
руками владельца**: интерактивный shell запускал `node qa-new-user.mjs`
(несколько итераций: 04:11, 05:16), скрипт дорабатывался на ходу
(05:12 — жёсткий `waitFor`: предикат, вернувший строку, больше не считается
«готово», скрипт падает сразу с описанием; 05:15 — правки `evaluate`),
рядом работал второй headless Chrome на порту 9334 с профилем
/tmp/pp-repro. Автозапуску нечего было делать без конфликта:

- Мои два пробных запуска (05:09, 05:13) столкнулись с сессией владельца
  (общий CDP-порт 9333, общий storage-профиль) и умерли без вреда: первый —
  `installRenderSpy is not defined` (файл в этот момент пересобирали),
  второй — timeout «onboarding step 2» (заблокирован владельцем).
- Итоговый прогон владельца (pid 21602, старт 05:16, интерактивный) к 05:33
  завершился: скрипт `qa-new-user.mjs` и server:3000 убраны, workspace
  чистый (git status пуст), профиль storage сброшен в чистый
  (onboarded=false, 0 ответов), `npm test` 79/79.
- Результат прогона зафиксирован НЕНАБЛЮДАЕМО: вывод шел в терминал
  владельца, не в лог; единственные артефакты — один скриншот
  01-onboarding.png (05:16) во временной папке
  /var/folders/.../T/pp-qa-no9ptp/shots и старые лог/скриншоты предшествующих
  отладочных прогонов (/tmp/qa-new-user.log, 04:20 — 15 FAIL, в т.ч.
  «dashboard: lede-действие есть», «ch1: итальянский оригинал», «exam:
  таймер идёт» — те зоны, что потом чинились и теперь покрыты тестами; и
  сессия 04:55 с PASS по EASY START / 20/20 / self-check / pre-start).

Варианты для владельца:
A. Сценарий завершён успешно вами — тогда просто вычеркните пункт QA в
   TODO.md (я не вычеркиваю сам: не видел результата и не буду отмечать
   закрытым то, что не проверял).
B. Сценарий ещё не доведён — следующий автозапуск возьмёт QA на себя:
   вернёт `qa-new-user.mjs` (скрипт уцелел в git-истории сессии, если
   владелец хочет его использовать — могу восстановить) и прогонит
   до конца с логами, а FAIL разберёт.
C. Оставить как есть: автозапуск возьмёт Фазу 2.1 (первую категорию RU —
   overlay `data/translations/<cat>.json`, механика overlay готова).

Заблокировано этим вопросом: только пункт «QA-сценарий нового пользователя»
в Фазе 2.2. В этом запуске ничего не коммичено по коду (только эта запись),
счётчик VERSION в sw.js не тронут (public/ не менялся).

## 2026-09-28 — Lede на экране статистики: действие, не описание (Фаза 2.2)
Запрос (текущий приоритет Фазы 2.2, пункт «Подсказки-вводные»): у
практики/экзамена/теории/ошибок/словаря/поиска lede уже были — остался
последний экран без вводной в нужном ключе: статистика (renderStats).
Закрыт этим пунктом весь список lede Фазы 2.2.

- **Что сделано**: `public/js/views.js` — lede в `renderStats` заменён
  с «WHERE YOU STAND AND WHAT TO STUDY NEXT.» (пассивное описание
  «что здесь») на действие «FIND YOUR WEAKEST TOPIC AND PRACTICE IT
  UNTIL THE TAG READS GREEN.» — пользователь видит конкретный следующий
  шаг: взять слабую тему из блока WEAK SPOTS и дожать её, ориентируясь
  на цветной тег точности (bad/warn/ok → зелёный ≥ 90%). `public/sw.js`:
  VERSION v24 → v25 (изменение файлов в public/, правило AGENTS.md);
  SHELL не менялся — views.js уже в списке.
- **Почему так**: (1) по критерию Фазы 2.2 lede — это действие, а не
  описание («Выбери тему и ответь VERO/FALSO», а не «Практика
  вопросов»), старая строка нарушала собственный критерий; (2) формула
  привязана к реальному UI — блок WEAK SPOTS прямо под lede, а цвет
  тега accuracy (зелёный от 90%) уже закодирован в `accTag`, т.е. строка
  объясняет, как читать экран и что считать «готово»; (3) правка в одну
  строку — минимальный риск, поведение не меняется.
- **Как проверено**: `npm test` — 79/79 зелёные. Smoke:
  `node server/index.js`, 200 на /api/health, /, /api/manifest,
  /api/theory, /api/lessons, /api/dictionary, /api/progress,
  /manifest.webmanifest; сервер убит по PID (обёртка + node-процесс,
  17032/17034), `lsof -ti :3000` пуст.

## 2026-09-28 — Скелет overlay-инфраструктуры переводов (Фаза 2.1)
Запрос (Фаза 2.1, пункт «Скелет»): банк `data/questions/*` read-only,
поэтому вся доработка переводов и новые языки должны идти отдельными
overlay-файлами, которые фронтенд налагает поверх банка при загрузке
вопросов. Прежде чем переводить хоть одну категорию, нужна сама
механика — иначе некуда писать правки.

- **Что сделано**: новый доменный модуль `public/js/domain/translations.js`
  (в доменной логике, а не в views): чистая функция
  `applyTranslationsOverlay(questions, overlay)` — на каждый вопрос с
  совпавшим id копирует `translations[lang].text` из overlay, трогая
  ТОЛЬКО локализованные `text` (и никогда `text_it`, `id`, `category`,
  `is_true`); вопросы без записи в overlay и невалидные значения
  (text не строка) не трогаются. Обёртка `loadOverlays(slug, bank, fetchFn)`
  — fetch `/data/translations/<slug>.json`; 404/ошибка сети → банк как
  есть (overlay опционален). `public/js/state.js`: `loadQuestions(slug)`
  теперь налагает overlay поверх ответа API перед кэшированием — единственная
  точка, через которую вопросы попадают в приложение, так что
  practice/exam/lessons автоматически получают оверлеи. `public/sw.js`:
  VERSION v23→v24, `/js/domain/translations.js` в SHELL.
- **Почему так**: (1) merge копиями, а не мутацией банка — кэшированный
  список нельзя случайно повторно «накрыть» overlay; (2) защита от
  `text_it` и структурных полей — overlay это данные перевода, а не
  источник правды по вопросам, и один кривой файл не должен ломать
  экзамен; (3) фолбэк на 404 обязателен — до появления первых overlay-
  файлов подпапки `data/translations/` не существует, и приложение
  должно работать без неё (проверено: сервер отдаёт 404); (4) fetch
  инжектом — модуль тестируется без DOM.
- **Как проверено**: `tests/translations.test.js` — 8 новых тестов:
  замена текста в заявленных языках, `it`/`id`/`is_true`/`category`
  неприкасаемы, не-строка text игнорируется, null/malformed overlay —
  no-op, 404 и throw в fetch — фолбэк на банк, end-to-end через
  `state.loadQuestions` с shim localStorage/fetch (overlay применяется,
  повторный вызов не пере-fetch'ит). `npm test`: 79/79 зелёные
  (было 71). Smoke: `node server/index.js`, 200 на /api/health, /,
  /api/manifest, /api/theory, /api/lessons, /api/dictionary,
  /api/progress, /manifest.webmanifest; `/data/translations/sorpasso.json`
  → 404 как ожидается; сервер убит по PID, `lsof -ti :3000` пуст.

## 2026-09-28 — Первый заведомый успех: практика новичка стартует с простых вопросов (Фаза 2.2)
Запрос (текущий приоритет Фазы 2.2): новичок с 0 ответами открывал
практику со случайной двадцаткой — и мог получить в первые вопросы
сложные формулировки или знаки, которые не может прочитать, — до того
как почувствовал механику VERO/FALSO.

- **Что сделано**: `public/js/views.js` — новая экспортируемая функция
  `introQueue(questions, { answers, batch, count, textLen })`: берёт
  вопросы темы (без картинки, text_it ≤ 120 символов, ещё не отвеченные)
  и если их ≥ 5 — первая пятёрка сессии, остаток батча добирается в
  обычном порядке (unseen → wrong → kept) из той же темы. Если таких
  меньше 5 (знаковые темы) — возвращает null и сессия идёт как обычно.
  `renderPracticeSession`: если в профиле 0 ответов (`beginner`),
  очередь = `introQueue ?? pickQueue`; в шапке сессии показывается
  бейдж «EASY START» (обычный `.tag`, новый CSS не нужен). `pickQueue`
  разбит на чистую `queueOrder(questions, answers, count)` + тонкую
  обёртку — `introQueue` перестала зависеть от глобального `state`
  и стала юнит-тестируемой без DOM.
- **Почему так**: (1) «легко» определено измеримо — короткий Italian
  text + без картинки; порог «5 таких вопросов в теме» выбран, чтобы
  не подменять сессию вопросами из других тем и не сломать знаковые
  темы, где коротких текстов по природе мало; (2) бейдж объясняет
  новичку, почему сессия «не как обычно», без отдельного текста;
  (3) флаг `beginner` по 0 ответов в профиле — единственное честное
  определение «новый пользователь» без миграций.
- **Тест**: `tests/security.test.js`, блок «phase 2.2: first
  guaranteed success» — 4 теста `introQueue` напрямую (шим
  window/localStorage, реальный `import` модуля): (а) первая пятёрка
  — только без картинки, ≤120, не отвеченные; без дублей; батч = 20;
  (б) весь батч — из той же темы; (в) знаковая тема (20 картинок + 4
  коротких) → null; (г) 6 лёгких + 30 тяжёлых → батч 20, первые 5 —
  без картинки.
- **public/**: VERSION в `sw.js` v22 → v23 (SHELL не менялся —
  views.js уже в списке).
- **Проверено**: `npm test` 70/70; smoke — 8 эндпоинтов (health, /,
  manifest, theory, lessons, dictionary, progress,
  manifest.webmanifest) 200; сервер убит по точному PID (15702),
  `lsof -ti :3000` пуст.
## 2026-09-28 — Экран перед экзаменом: «как проходит реальный экзамен» (Фаза 2.2)
Запрос (текущий приоритет Фазы 2.2): до начала экзамена новичку не
объясняли формат реального экзамена, и экран не говорил честно,
что это тренировка.

- **Что сделано**: `public/js/views.js`, `renderExam` — до запуска
  таймера (перед BEGIN EXAM) теперь показывается панель «HOW THE REAL
  EXAM WORKS»: 30 случайных вопросов о знаках и ПДД; 20 минут —
  таймер стартует с нажатия; прохождение при не более 3 ошибках,
  иначе экзамен провален; можно ходить между вопросами,
  неответивший считается ошибкой; вопросы на итальянском, T /
  кнопка TRANSLATE показывает язык пользователя. Сверху — строка
  «THIS IS PRACTICE, NOT THE OFFICIAL EXAM — BUT THE FORMAT AND THE
  DIFFICULTY ARE IDENTICAL.» (честная рамка: это не официальный
  экзамен). Заголовок панели переименован с «OFFICIAL FORMAT» — он
  врал про тренировочный режим.
- **Почему так**: формат 30/20/3 захардкожен в тексте (как в
  онбординге) — тест сверяет текст напрямую; константы
  EXAM_QUESTIONS / EXAM_SECONDS / EXAM_MAX_ERRORS (30/1200/3) и
  дальше используются игровой логикой, расхождение текста с ними
  было бы ловушкой.
- **Тест**: `tests/security.test.js` — «the exam pre-start screen
  explains the format and that it is practice»: вырезает `renderExam`
  по точной сигнатуре `export async function renderExam(` (в файле
  раньше стоит `renderExamItalian` — матч по имени ложился на неё),
  берёт участок до `async function start`, проверяет: это практика
  и не официальный экзамен, 30 вопросов, 20 минут, не более 3
  ошибок, можно ходить между вопросами, есть перевод.
- **public/**: VERSION в `sw.js` v21 → v22 (новых js-файлов нет —
  SHELL не тронут).
- **Проверено**: `npm test` 66/66; smoke — 8 эндпоинтов (health, /,
  manifest, theory, lessons, dictionary, progress,
  manifest.webmanifest) 200; сервер убит по точному PID (15012),
  `lsof -ti :3000` пуст.
## 2026-09-28 — Починен тест «streak increments once per day», упавший вне UTC
Запрос (авто-запуск): `npm test` красный — 1 из 65.

- **Причина**: тест симулировал «вчера» как
  `new Date(Date.now() - 86400000).toISOString().slice(0, 10)` — то есть
  **UTC**-дата «24 часа назад». Доменная логика (`today()` в
  `public/js/domain/progress.js`) намеренно использует **локальную**
  календарную дату (комментарий: сессия в 23:30 в Риме — это тот же день).
  В таймзоне UTC+2 (машина владельца) локальный день на день впереди UTC:
  `today()` = 28.09, «вчера» из теста = 26.09 → разрыв 2 дня → стрик
  сбрасывался до 1 вместо ожидаемого 2. В CI (UTC) даты совпадают —
  поэтому сбой был только локально и зависел от часов пояса.
- **Исправление** (минимальное, только тест, домен не тронут):
  `tests/progress.test.js` — «вчера» теперь считается как локальный
  календарный день (`setDate(getDate() - 1)` + локальный формат),
  идентично логике `today()`/`dayBefore()`: DST-safe, без вычитания 24 ч.
- **Почему не правили домен**: поведение `today()` — принятое решение
  (комментарий с обоснованием), а тест только неправильно моделировал
  время; менять доменную логику ради теста — регрессия.
- Проверено: `npm test` 65/65; `node --test tests/progress.test.js`
  зелёный и в `TZ=UTC`, и в `TZ=Europe/Rome`; smoke — все 8 эндпоинтов 200,
  сервер убит по PID, порт 3000 свободен. public/ не тронут — SW не
  поднимался.
- В этом запуске, по регламенту, ничего больше не делалось.

## 2026-09-27 — Онбординг: слайсы 2–3 до «2 строки + 1 кнопка» (Фаза 2.2)
Запрос (подзадача Фазы 2.2): слайсы 2–3 онбординга были перегружены —
по 2 кнопки (BACK + CONTINUE) и по 2 абзаца текста. Лимит: максимум
2 строки текста (заголовок + один lede) и одна кнопка.

- **Слайс 2 «How you will study»** (`public/js/views.js`, `renderOnboarding`):
  два абзаца (`lede` + `stat-sub`) слиты в один lede: «Pick a topic and
  answer VERO or FALSO — read the theory when unsure, then take a mock exam»
  (ключевые факты сохранены: VERO/FALSO, теория, экзамен); кнопка BACK
  убрана, осталась одна CONTINUE →.
- **Слайс 3 «Your progress never leaves here»**: кнопка BACK убрана,
  осталась одна START LEARNING →; lede и селектор языка не тронуты
  (и так один абзац).
- **Почему BACK можно убирать без потерь**: онбординг показывается, пока
  профиль не отмечен `onboarded: true`, а метка ставится только при
  завершении (START LEARNING) или SKIP — т.е. новичок, закрывший вкладку
  на середине тура, увидит его заново, а SKIP на слайсе 1 сохраняет
  введённые имя и язык. В пути тур ничего не сохраняет, так что потеряна
  будет только пара нажатых клавиш.
- **Тест** (`tests/security.test.js`, расширен «onboarding explains the
  exam…»): слайсы 2–3 не содержат «← BACK» и (для слайса 2) второго
  абзаца `stat-sub` — правило «2 строки + 1 кнопка» зафиксировано, а
  не только выполнено.
- Проверено: `npm test` 65/65; smoke — все 8 эндпоинтов 200
  (`/api/health`, `/`, `/api/manifest`, `/api/theory`, `/api/lessons`,
  `/api/dictionary`, `/api/progress`, `/manifest.webmanifest`); раздачу
  свежих файлов подтвердил проверкой `sw.js`/`views.js` на живом
  сервере (v21, BACK в views.js нет).
- SW → v21 (изменён views.js, SHELL не менялся — новых js нет).
- TODO.md: закрыта подзадача по слайсам 2–3.

## 2026-09-27 — Пустые состояния дашборда: «следующий шаг» вместо нулей (Фаза 2.2)
Запрос (Фаза 2.2, текущий приоритет): новичок без ответов видит «0 / 0 / 0%»
и не понимает, что делать. Дашборд обязан показывать следующий шаг; после
первого экзамена — «что чинить до экзамена», а не сырые цифры.

- **NEXT STEP-панель** (`public/js/views.js`, `nextStepsPanel`): показывается
  пока `stats.answered === 0`. Текст — действие, не описание: «вы ещё не
  отвечали ни на один вопрос — начните с практики: 20 вопросов, ~5 минут»
  + кнопка **PICK A TOPIC AND START PRACTICE** (→ `#/practice`) и вторичная
  ссылка «сначала прочитать теорию» (→ `#/theory`). Сырые карточки 0/0/0%
  остаются ниже (они честны), но первый экран — это шаг, а не нули.
- **UNTIL THE EXAM-панель** (`weakSpotsPanel`): показывается при
  `exams.length > 0`. Считается из настоящих данных, без новой доменной
  логики: результат последнего экзамена (тег PASSED/FAILED), до 3 слабых
  тем (attempted > 0 и accuracy < 70%, сортировка по худшей) с точностью и
  кнопка «STRENGTHEN <тема>» (→ `#/practice/<slug>`); если слабых тем нет —
  «NO WEAK TOPIC UNDER 70%» + «ANOTHER MOCK EXAM». При ошибках —
  «REVIEW N MISTAKES».
- **Тест** (`tests/security.test.js`): «the dashboard shows the next step,
  not raw zeros» — панели существуют и подключены к `renderDashboard`
  (условия `stats.answered === 0` / `exams.length > 0`).
- Проверено: `npm test` 65/65; smoke — все 8 эндпоинтов 200, сервер убит
  по PID. SW → v20 (изменён views.js, SHELL не менялся — новых js нет).
- TODO.md: закрыт пункт «дашборд пустого состояния».

## 2026-09-27 — Онбординг из 3 слайсов (Фаза 2.2 «Понятность для нового пользователя»)
Запрос: новый пользователь должен за минуту понять, что это за экзамен, как
здесь учить и что происходит с его данными — без чтения документации.
Старый онбординг (2 экрана: «имя + язык» / «before you start») не отвечал
спеке: не было SKIP, язык был «спрятан» в середине, формат экзамена и цикл
учения не объяснялись.

- **3 слайса** (`public/js/views.js`, `renderOnboarding`):
  1) «The patente B exam: 30 questions, 20 minutes, at most 3 errors»
  + поле имени; 2) «How you will study» — тема → VERO/FALSO → теория →
  экзамен; 3) «Your progress never leaves here» — только на устройстве,
  экспорт бэкапа в Settings + **выбор языка перевода прямо в туре**
  (требование Фазы 2.2: не спрятанная в Settings настройка).
- **SKIP THIS TOUR** на первом слайсе (сохраняет введённое имя и язык и
  завершает онбординг), **прогресс-точки** — 3 шт., заполняются по ходу
  (`ONBOARDING_STEPS`). Имя на слайсе 1 помечено «(optional)».
- **Тест** (`tests/security.test.js`): новый «onboarding explains the
  exam, the learning loop and local storage» — фиксирует ключевые
  формулировки всех трёх слайсов, наличие SKIP, `ob-lang` в туре и
  `ONBOARDING_STEPS = 3`.
- Проверено: `npm test` 64/64; smoke — все 8 эндпоинтов 200
  (`/api/health`, `/`, `/api/manifest`, `/api/theory`, `/api/lessons`,
  `/api/dictionary`, `/api/progress`, `/manifest.webmanifest`), сервер
  убит по PID.
- SW → v19 (изменён views.js). TODO.md: закрыты пункты «онбординг» и
  «язык в онбординге», добавлена подзадача по лимиту «макс. 2 строки +
  1 кнопка» на слайсах 2–3.

## 2026-09-27 — Установка как приложение на телефон (local-first, без аккаунтов)
Решение владельца: без сервера с данными и без аккаунтов (никакого сбора
данных, чтобы не уходить под итальянское законодательство). Основной путь
доставки — «установить с сайта на главный экран», Google Play (TWA) —
дополнительно.

- **iOS-метки** (`public/index.html`): `apple-mobile-web-app-capable`,
  `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`,
  `apple-mobile-web-app-title` — без них «Add to Home Screen» даёт серый
  плейсхолдер-иконку и браузерную рамку.
- **Панель «INSTALL AS APP» в Settings** (`public/js/install.js`):
  Android/Chromium ловит `beforeinstallprompt` (свой инфо-бар Chrome
  подавлен, install — осознанным действием из Settings); iOS Safari не
  даёт prompt API — там текстовая инструкция через share-sheet; если
  уже standalone (`display-mode`/`navigator.standalone`) — статус
  «INSTALLED». Обновляет сам себя по `appinstalled`.
- **Футер** теперь говорит правду в обоих режимах: в standalone
  (сборка Vercel) `main.js` подменяет текст про `storage/progress.json`
  на «PROGRESS LIVES ONLY IN THIS BROWSER — NOTHING LEAVES YOUR DEVICE».
- **Тесты** (`tests/security.test.js`): метки iOS на месте; новый инвариант —
  каждый файл `public/js/*.js` обязан числиться в SHELL-списке sw.js
  (иначе первый офлайн-старт на телефоне упадёт); Settings предлагает
  путь установки. 63/63.
- SW → v18 (SHELL += install.js).

## 2026-09-27 — Тепловая карта активности за 90 дней (Фаза 1.7)
Страница «Progress & Stats» получила карту активности в духе GitHub:
столбцы — недели (с понедельника, как в Италии), 5 уровней интенсивности.

- **Домен менять не пришлось** — `dailyAnswers` (кап 90 дней) уже собирался;
  карта — чистая презентация поверх `state.progress.dailyAnswers`.
- **UI** (`public/js/views.js` + `public/styles.css`): панель
  «ACTIVITY — LAST 90 DAYS» на `#/stats` под сводными картами. Банды
  интенсивности: 1–19 / 20–39 / 40–79 / 80+ ответов; цвета — токены
  `--heat-0…4` в обеих темах (тёплый оранжевый от нейтрального к `--accent`).
  Подписи месяцев над столбцами + легенда LESS/MORE.
- **Доступность**: сетка декоративная — цифры продублированы текстовой строкой
  («N ACTIVE DAYS · M QUESTIONS ANSWERED · BEST DAY …»), на самой сетке
  `role="img"` с aria-label, на ячейках `title` для ховера.
- **Пустое состояние**: без ответов — заглушка «ANSWER SOME QUESTIONS…»
  (как у Weak Spots).
- **Нашёл и починил в QA**: при подписях месяцев в соседних столбцах текст
  налезал друг на друга (JUN/JUL) — теперь между подписями минимум два
  столбца, проигрывает более ранняя.
- QA: 375px в настоящей мобильной эмуляции (CDP `setDeviceMetricsOverride`) —
  `scrollWidth` ровно 375, переполнений нет; light/dark; пустое состояние;
  кольцо дашборда «/ 30» из профиля; селектор DAILY GOAL в Settings;
  ноль ошибок консоли/экстрашенов; тесты 60/60; smoke CI-эндпоинтов — 200.
  (Первые «обрезанные» скриншоты оказались артефактом: headless Chrome даёт
  минимум 500px ширины окна, а не 375 — проверяйте мобильное через эмуляцию.)
- SW → v17.

## 2026-09-27 — Настраиваемая дневная цель (Фаза 1.7)
Кольцо на главной заполнялось под константу 20 вопросов; теперь цель —
поле профиля, меняется в Settings.

- **Домен** (`public/js/domain/progress.js`): `profile.dailyGoal`,
  константы `DAILY_GOAL_MIN/MAX/DEFAULT` (5–200, дефолт 20). Валидация —
  целое в диапазоне; `migrateProgress` снисходителен (старые снимки
  получают дефолт, битое значение отбрасывается), `importProgress` строгий
  (мусор из бэкапа → 422). Оба режима (сервер и standalone) работают через
  один ProgressService — дублировать правила не пришлось.
- **UI**: в Settings панель PROFILE — селектор DAILY GOAL с пресетами
  (5–100); значение вне пресетов тоже показывается отдельным пунктом.
  Кольцо дашборда и подпись «N / цель» берут профиль, не константу.
- Тестов: 60 (+2, +1 ассерт в тесте миграции). SW → v16.

## 2026-08-28 — Прогресс переживает обновление сайта
Запрос владельца: при обновлении визуала прогресс не должен падать.
Проверил и закрыл реальные дыры.

- **Версионирование схемы + миграция.** `SCHEMA_VERSION` в EMPTY_PROGRESS и
  `migrateProgress(raw)` в доменном модуле. Он намеренно снисходителен (в
  отличие от `importProgress`, который обязан ругаться на плохой файл):
  читает данные, которые приложение само записало, возможно старой версией,
  и потерять историю из-за одного странного поля хуже, чем это поле выкинуть.
  Используется ОБОИМИ хранилищами — и localStorage, и progress.json.
- **Найдено: в браузере повреждённые данные молча стирались.** На сервере
  битый файл уходил в карантин, а в localStorage — нет. Теперь так же:
  копия сохраняется под `pp-progress.corrupt.<ts>`.
- **Резервная копия** пишется при каждом успешном чтении (не только при
  записи — иначе новый пользователь не защищён до первого сохранения) и
  перед каждой перезаписью. При повреждении основного ключа данные
  восстанавливаются из копии, и основной ключ чинится сразу.
- **Запрос persistent storage** — иначе iOS чистит хранилище сайтов,
  не добавленных на домашний экран, примерно через неделю простоя.
  Статус показан в Settings честным текстом, а не зелёной галочкой.
- **Старые снимки восстанавливают activeDays** из streak.lastDay и
  dailyAnswers, чтобы полоса недели не выглядела пустой после обновления.
- Проверено в браузере: снимок «старой версии» (без version/sound/
  activeDays) → перезагрузка → имя, 3 ответа, ошибки, 2 экзамена, стрик 6,
  главы — всё на месте, онбординг не появился. Порча основного ключа →
  карантин + восстановление из копии + починка ключа.
- ⚠ Задокументировано: смена домена = смена origin = пустой профиль.
  Предупреждение в README и в PLAY-STORE.md (там, где советую свой домен).
- Тестов: 58 (+7).

## 2026-08-28 — Нижняя панель на iPhone и визуализация на главной
**Баг (сообщил владелец, iPhone 15 Pro Max):** нижняя панель «отъезжает»
при скролле, под ней виден контент. Причина: в `<meta viewport>` не было
`viewport-fit=cover`, поэтому `env(safe-area-inset-*)` всегда 0, панель
стояла в `bottom:0` без учёта home indicator, а `100vh` на iOS не учитывает
выезжающую панель браузера. Исправлено: viewport-fit=cover, `100dvh`,
`padding-bottom: env(safe-area-inset-bottom)` у панели, отступ снизу у main
с учётом инсета, `padding-top: env(safe-area-inset-top)` у шапки (иначе с
cover она уехала бы под чёлку).
Проверка: Chromium в песочнице отдаёт env() = 0, поэтому написал симуляцию
с подстановкой реальных инсетов iPhone (59px сверху, 34px снизу) — панель
достаёт до края, иконки на 34px выше индикатора, контент не перекрыт.

**Визуализация на главной:**
- Полоса недели: 7 клеток, отмечены дни с активностью, сегодня обведён
  акцентом, счётчик «N/7 DAYS». Для этого в домене появился `activeDays`.
- Кольцо прогресса. Сначала повесил на «освоено», но при 7139 вопросах оно
  висит на 0% неделями и выглядит сломанным — переделал на **дневную цель**
  (20 вопросов), она заполняется каждый день. Для этого в домене появился
  `dailyAnswers` (счётчик по дням, капы на 90 дней).
- Заодно исправлена давняя неточность: день считался по UTC
  (`toISOString`), из-за чего сессия в 23:30 в Италии попадала на завтра.
  Теперь локальная календарная дата, а «вчера» вычисляется по календарю
  (устойчиво к переводу часов).
- Тестов: 51 (+5). SW → v14.

## 2026-08-27 — Аудит безопасности и приватности
Проверял, а не декларировал. Что проверено и с каким результатом:
- **Исходящий трафик**: перехват всех запросов за полный сеанс (онбординг,
  практика, полный экзамен, поиск, статистика, бэкап) — 73 запроса, все на
  собственный origin, наружу НИ ОДНОГО. Ни аналитики, ни beacon, ни внешних
  шрифтов/скриптов. Единственный внешний URL — ссылка на источник в credits.
- **Хранилища**: только один ключ localStorage (pp-progress, ~5 КБ).
  Кук нет, IndexedDB нет, sessionStorage пуст.
- **XSS**: payload в имени и в импортируемом бэкапе сохраняется и печатается
  КАК ТЕКСТ (0 внедрённых узлов, скрипт не выполняется). В коде нет ни
  innerHTML, ни eval, ни new Function.
- **Загрязнение прототипа** через `__proto__` в answers/profile — не проходит.
- **Обход каталогов**, CORS (Access-Control не отдаётся), небезопасные методы
  (405), привязка к 127.0.0.1 — всё в порядке.

Добавлено (усиление):
- **CSP** на хостинге (vercel.json) и на локальном сервере: `connect-src 'self'`
  делает утечку невозможной структурно, `script-src 'self'` без unsafe-inline.
  Проверено: приложение под CSP работает целиком, включая blob-экспорт бэкапа
  и service worker — 0 нарушений.
- X-Content-Type-Options, Referrer-Policy: no-referrer, X-Frame-Options,
  COOP/CORP, Permissions-Policy (запрет геолокации/камеры/микрофона/…).
- Android: `allowBackup="false"` + data_extraction_rules — Android не копирует
  данные приложения в Google Drive и не переносит на новое устройство.
- `rel="noopener noreferrer"` на единственной внешней ссылке.

**Найден и исправлен дефект**: при превышении лимита тела сервер вызывал
`req.destroy()` ДО отправки ответа — клиент получал обрыв соединения вместо
413. Теперь остаток тела сливается без буферизации, и клиент получает
честный `413 Request body too large`. Сервер при этом выживал и раньше.

- Тестов: 46 (+10 в tests/security.test.js — фиксируют CSP, отсутствие
  внешних origin, запрет innerHTML/eval, защиту от pollution, лимиты,
  разрешения Android).

## 2026-08-26 — Лицензия банка вопросов проверена, добавлена атрибуция
- Склонировал источник Ed0ardo/QuizPatenteB: лицензия **MIT**, © 2023 Edoardo.
  Данные совпадают (413 картинок, 7139 вопросов) — происхождение подтверждено.
- MIT разрешает коммерческое использование и распространение, НО требует
  включать копию лицензии и копирайт «во все копии или существенные части».
  Мы этого не делали — то есть формально нарушали лицензию. Исправлено:
  THIRD-PARTY-NOTICES.md в репозитории и /credits.html внутри приложения
  (ссылка из Settings → ABOUT, страница в офлайн-кэше SW).
- Отдельно зафиксировано: MIT покрывает работу Edoardo, а исходные тексты
  вопросов — министерские. Обычное основание — Legge 633/1941 art. 5
  (тексты официальных актов государства вне авторского права), но это не
  юридическая консультация; перед коммерческим релизом стоит подтвердить.
- Дисклеймер «не официальное приложение» есть и в credits, и в privacy,
  и в описании для стора. SW VERSION → v13.

## 2026-08-26 — Подготовка к Google Play (итерация 1)
- Путь выбран: Trusted Web Activity поверх нашего PWA (официальный механизм
  Google), а не обёртка-вебвью — офлайн-режим и локальные данные и есть
  аргумент против политики Minimum Functionality.
- Манифест доведён до требований Play: id, lang/dir, orientation, categories,
  display_override, prefer_related_applications, maskable-иконка (контент в
  безопасной зоне 80% — Android режет по кругу), 4 screenshots с form_factor.
- Сгенерированы материалы листинга: feature graphic 1024×500 и 4 реальных
  скриншота приложения 1080×1920 (360×640 CSS при DPR 3, как настоящий телефон),
  прогресс засеян через собственный API приложения с реалистичным разбросом.
- /privacy.html — политика приватности (обязательный URL для Play). Честно
  описывает и логи хостинга, а не только «ничего не собираем».
- docs/PLAY-STORE.md — чеклист: аккаунт ($25, для новых личных аккаунтов
  требуется закрытый тест 12 человек × 14 дней), Digital Asset Links,
  сборка .aab через Bubblewrap, тексты листинга, формы Data safety/rating.
- SW VERSION → v12 (maskable-иконка в precache).

## 2026-08-26 — Standalone-режим (телефон) и схема архитектуры
- Vercel — serverless, постоянного диска нет, поэтому progress.json там жить
  не может. Вместо базы (и зависимости) хостинг-версия хранит прогресс в самом
  браузере, но теми же правилами: доменный модуль переехал в
  public/js/domain/progress.js (ноль импортов, ноль Node API), server/progress.js —
  реэкспорт. Одна реализация правил на два хоста.
- public/js/local-progress.js — LocalStore на localStorage + тот же ProgressService.
- Контент читается из /data/* в обоих режимах (локальный сервер отдаёт этот путь),
  различается только «прогрессовая» половина API.
- Режим определяется меткой <meta name="pp-mode"> которую ставит сборка —
  детерминированно и без лишнего запроса (проба /api/health светила 404 в консоли).
- scripts/build-static.js + vercel.json собирают dist/ (458 файлов, 8.1 МБ).
  Локальная разработка остаётся без сборки.
- docs/ARCHITECTURE.html переписан: две схемы (два режима с общим доменным
  модулем; путь ответа с офлайн-очередью), карта ответственности, где живёт прогресс.
- ⚠ В ветке main лежит только июньская загрузка — Vercel по умолчанию собирает
  её. Нужно либо смержить рабочую ветку в main, либо сменить production branch.
- Тестов: 36 (добавлен tests/standalone.test.js на браузерное хранилище).

## 2026-08-26 — Доводка до продукта: надёжность, бэкап, объяснение ошибок
- **QA-прогон** 14 экранов × desktop/mobile/dark: ошибок консоли, битых
  запросов, пустых экранов и горизонтального скролла нет.
- **Найден и исправлен баг:** результат экзамена сохранялся напрямую через
  `api`, мимо офлайн-очереди — 20 минут работы терялись при сбое сети.
  Очередь обобщена до типизированных записей (`answer` / `exam`),
  реплей строго по порядку: подряд идущие ответы батчами по 100,
  экзамены — по одному. Проверено SIGKILL сервера в момент сдачи.
- **Найден пробел:** при падении локального сервера событие `online` не
  наступает (сеть-то жива), и очередь висела до следующего ответа.
  Добавлено самовосстановление: ретрай раз в 20 с, пока очередь не пуста,
  плюс попытка при возврате во вкладку. Проверено без перезагрузки.
- **Бэкап прогресса**: экспорт в JSON-файл из настроек и импорт с полной
  серверной валидацией (`POST /api/progress/import`, `importProgress`).
  Импорт заменяет, а не сливает; неизвестные поля отбрасываются; mistakes
  приводятся в соответствие с answers. Полный бэкап ~1 МБ при 7139
  ответах — поэтому у маршрута свой лимит тела (8 МБ) вместо 256 КБ.
- **Объяснение ошибки** (закрыт пункт Фазы 1): решено не заполнять 7139
  пустых полей `explanation`, а показывать при промахе блок «WHY? — KEY
  FACTS» с must-know фактами урока соответствующей главы (обратная карта
  `CATEGORY_CHAPTER`), уроки грузятся лениво по клику.
- **CI**: GitHub Actions — тесты на Node 18/22, проверка отсутствия
  зависимостей, smoke-тест поднятого сервера по ключевым маршрутам.
- Тестов: 30. SW VERSION → v10.

## 2026-08-05 — Очередь офлайн-ответов (Фаза 1 закрыта)
- api.js помечает сетевые сбои (err.network) отдельно от HTTP-ошибок:
  в очередь попадают только недоставленные ответы, 422 — никогда.
- state.js: localStorage-очередь + recordAnswersResilient — при недоступном
  сервере ответ ставится в очередь и зеркалится в локальный снапшот
  (answers/mistakes/stats), сервер остаётся источником правды.
- flushAnswerQueue: реплей по порядку чанками по 100 (лимит сервера);
  вызывается при старте, по window online и при следующем ответе.
  Валидационная ошибка в очереди отбрасывает чанк (без «отравления»).
- Квиз показывает плашку OFFLINE (role=status) пока идёт накопление,
  убирает после синхронизации. Ошибочный баннер больше не выскакивает.
- E2E с реальным SIGKILL сервера посреди сессии: 3 ответа в очередь,
  рестарт — очередь дренируется, все ответы на сервере. SW → v7.

## 2026-08-05 — Проход по доступности
- Skip-link «SKIP TO CONTENT» (первый tab-stop), main с tabindex=-1.
- Снят шумный aria-live со всего main; вместо него точечно: фидбек
  ответа — role=status, таймер экзамена — role=timer (без посекундных
  анонсов), декоративные SVG-иконки nav и прогресс-бары — aria-hidden.
- aria-current=page на активной ссылке nav (роутер).
- Self-test словаря управляем с клавиатуры (role=button, tabindex,
  Enter/Space); модалка знака: фокус на «Close» при открытии, возврат
  фокуса открывшему элементу при закрытии.
- Контраст muted-текста тёмной темы поднят: alpha 0.45 → 0.62.
- SW VERSION → v6.

## 2026-08-05 — Звук и анимация ответа
- public/js/sound.js: два коротких square-блипа через WebAudio (верно —
  растущая терция 660→880, неверно — низкий 160 Гц), без аудиофайлов.
- Профиль получил поле sound (boolean, по умолчанию true) с серверной
  валидацией и тестом; тумблер ANSWER SOUNDS в настройках; старые
  профили без поля трактуются как «включено».
- Встряска карточки при ошибке (260 мс) + pop фидбека; отключается
  через prefers-reduced-motion.
- sound.js добавлен в SHELL precache SW; VERSION → v5.

## 2026-08-05 — Поиск по вопросам (#/search)
- Полнотекстовый поиск по всем 7139 вопросам: итальянский оригинал +
  перевод на язык пользователя, от 3 символов, до 60 результатов.
- Фолдинг акцентов (NFD + удаление диакритик): «puo» находит «può».
- Ответ VERO/FALSO скрыт за кнопкой ANSWER (философия «сначала подумай»),
  кнопка «PRACTICE THESE» запускает сессию из найденного (до 20).
- Вход со страницы практики; SW VERSION → v4.

## 2026-08-05 — Быстрое повторение (#/review)
- Умная сессия из 10 вопросов, приоритет: текущие ошибки (до 4) →
  2 слабейшие темы по точности (до 4, через pickQueue) → «удержание» —
  правильно отвеченные с самым старым таймстемпом `last` → стартовый
  набор из случайных тем для нового пользователя.
- Кнопка на дашборде, экран результата с «ONE MORE ROUND»;
  промахи автоматически попадают в mistakes (существующий механизм).
- SW VERSION → v3 (изменения в public/).

## 2026-07-30 — Уроки для всех 25 глав
- Дописаны уроки оставшихся 15 глав (ch6, ch7, ch10, ch14–ch25) в том же
  формате: цель, key ideas, must know, реальные ловушки из банка.
- Педагогические пары «ложь/правда, различающиеся одной оговоркой»
  (например, ch15: тоннель «solo se scarsamente illuminate» FALSO против
  «anche di giorno» VERO) — учат проверять оговорку, а не ключевое слово.
- ch14 и ch23 делят категорию norme-varie: вопросы-ловушки выбраны разные
  (ch14 — треугольник/жилет, ch23 — выступающий груз/буксировка).
- Тестовое зеркало CHAPTER_CATEGORY дополнено до полной карты.

## 2026-07-28 — Уроки теории для иностранцев + гид «L'italiano dell'esame»
- Педагогический слой поверх теории (data/lessons.json, /api/lessons):
  спроектирован с позиции инструктора, готовящего иностранцев, — они
  проваливают экзамен из-за ЯЗЫКА формулировок, а не правил.
- Урок главы: цель → KEY IDEAS (3–4 идеи простым языком на языке
  пользователя, термины — по-итальянски) → MUST KNOW (цифры/факты) →
  «HOW THE EXAM TRICKS YOU HERE» — реальные вопросы-ловушки из банка
  (резолвятся по id — текст/картинка/ответ не могут разойтись с данными),
  скрытый вердикт + разбор ловушки. Покрыты 10 ключевых глав:
  ch1–ch5, ch8, ch9, ch11–ch13. Главы без урока рендерятся как раньше.
- Страница #/exam-italian: слова-ловушки (sempre/mai/solo), deve vs può,
  глаголы семейств знаков (preavvisa/vieta/obbliga/indica), структурные
  ловушки (двойные утверждения, отрицания) + правила инструктора.
  Баннер со списка теории, ссылка из каждого блока ловушек.
- Тесты: полнота en/ru/zh всех текстов, валидность структуры, каждый
  trap-id существует в соответствующей категории банка (14 тестов).
- SW VERSION → v2, /api/lessons добавлен в офлайн-кэш и загрузчик.

## 2026-07-02 — PWA: установка на телефон и офлайн-режим
- `manifest.webmanifest` + иконки 192/512 (сгенерированы в стиле
  брутализма), `<meta theme-color>`, apple-touch-icon — приложение
  ставится на домашний экран как standalone.
- `public/sw.js` — service worker: оболочка (HTML/CSS/JS) — network-first
  с фолбэком в кэш (обновления кода приходят сразу, офлайн работает);
  данные (вопросы/теория/словарь/картинки) — stale-while-revalidate;
  GET /api/progress — network-first с фолбэком (дашборд офлайн показывает
  последнее известное состояние); мутации — только сеть, не кэшируются.
- Настройки → «OFFLINE MODE»: кнопка DOWNLOAD FOR OFFLINE прогревает кэш
  всеми вопросами, теорией, словарём и 413 картинками (~8 МБ) с прогрессом.
- Проверено E2E: офлайн-перезагрузка, дашборд, практика с картинкой,
  глава теории — всё работает без сети. Ответы офлайн не ставятся в
  очередь (v1) — фиксируются только онлайн; очередь — в TODO.
- Правило: менять VERSION в sw.js при изменениях в public/ (в CLAUDE.md).

## 2026-06-11 — Страница статистики и прогресса (#/stats)
- Новый экран «PROGRESS & STATS»: сводка (освоено %, общая точность,
  успех экзаменов + стрик), блок «WEAK SPOTS» — 5 тем с худшей точностью
  и кнопкой PRACTICE прямо к теме, столбчатый график ошибок последних
  12 экзаменов (зелёный/красный по сдаче), полный список 25 тем с баром
  освоения и тегом точности (зелёный ≥90 / жёлтый ≥70 / красный <70).
- Хелпер `categoryStats()` — чистая деривация из журнала ответов (без
  мутаций): различает «покрытие» (masteredPct) и «надёжность» (accuracy
  по всем попыткам). Ссылка на страницу — с дашборда (nav не расширял,
  чтобы не ломать мобильный 6-колоночный бар).
- Проверено на desktop/dark/mobile; данные для проверки засеяны через API.

## 2026-06-11 — Описания знаков и словарь экзаменационной лексики
- **Клик по знаку в теории** → модальное окно «WHAT THIS SIGN MEANS»:
  описание собирается из ПРАВДИВЫХ утверждений банка вопросов об этом
  знаке (никакого сгенерированного контента), перевод за кнопкой/клавишей
  T, кнопка «практиковать все вопросы с этим знаком». Esc/оверлей — закрыть.
- **Словарь** `data/dictionary.json`: 9 тематических разделов, 107 терминов
  с переводами en/ru/zh (включая раздел «глаголы экзаменационных
  формулировок»). Каждая глава теории покрыта хотя бы одним разделом
  (это проверяет тест). ⚠ Китайские переводы стоит отдать на вычитку носителю.
- Страница `#/dictionary`: режим SELF-TEST — переводы скрыты плашками,
  раскрываются по одному тапу. Блок «VOCABULARY OF THIS CHAPTER» на
  страницах глав, CTA на списке теории.
- Эндпоинт GET /api/dictionary; тесты валидации словаря (структура,
  полнота переводов, покрытие глав) — всего теперь 11 тестов.

## 2026-06-11 — Страница изучения теории (полный редизайн)
- **Связка глав с темами вопросов**: `public/js/theory-map.js` — маппинг
  25 глав на категории банка (данные в `data/` не тронуты, это
  presentation-уровень). Главы 13/14/23 делят общие категории.
- **Список глав**: общий прогресс чтения + CTA «CONTINUE — CHAPTER N»
  (первая непрочитанная), на карточках — итальянское название первым
  (философия «сначала оригинал»), число вопросов темы и % освоения с баром.
- **Страница главы — блоки**: оригинальный текст (перевод по-прежнему за
  кнопкой/клавишей T) → галерея знаков главы (уникальные картинки из
  вопросов темы, lazy-load, до 18 шт.) → «CHECK YOURSELF» (освоение темы
  + мини-проверка на 5 вопросов прямо из главы + ссылка на полную
  практику) → MARK AS READ → навигация ← CAP. N | CAP. N →.
- Мини-проверка использует общий `renderQuizSession` (новая опция
  `onQuit`); результат показывается баннером на странице главы.
- Хелперы `pickQueue` (новые → ошибки → остальное) и `masteryOf`
  вынесены и переиспользуются практикой/теорией.

## 2026-06-11 — Мобильная версия, скрытые переводы, иконки навигации
- **Перевод скрыт по умолчанию везде** (практика, экзамен, теория):
  пунктирная кнопка «TRANSLATE (язык)» или клавиша `T`. Цель продукта —
  побудить читать итальянский оригинал; перевод — только если не понял.
  Состояние сбрасывается на каждом новом вопросе.
- **Клавиатура на экзамене**: `V`/`F` — ответ, `←`/`→` — навигация по
  вопросам, `T` — перевод (в практике уже было V/F/Enter, добавлена `T`).
- **Навигация с иконками** (inline SVG, штрих 2.5 — в стиле брутализма).
  На мобильных (<760px) нав-бар фиксируется внизу экрана сеткой 6 колонок —
  под большой палец. Подсказки клавиш на мобильных скрыты.
- Мобильная полировка всех экранов (375px): крупные кнопки VERO/FALSO,
  компактные панели, отступ под нижний бар.
- Проверено headless Chromium на 375×812 и 1280×900: все экраны,
  переводы, клавиатура, дашборд, экзамен с результатом.

## 2026-06-10 — Локализация картинок
- Все 413 уникальных изображений знаков скачаны в `data/images/` (2,5 МБ),
  `image_url` в 3983 вопросах переписаны на локальные `/images/<file>`.
  Зависимость от чужого репозитория (raw.githubusercontent.com/Ed0ardo/QuizPatenteB)
  устранена. Скрипт: `npm run fetch-images` (идемпотентный, с ретраями).
- Сервер раздаёт `/images/*` из `data/images/` с кешем на сутки.

## 2026-06-10 — Полный рефакторинг (v2.0)
**Контекст:** в репозитории был только скомпилированный Vite/React-бандл без
исходников + JSON-данные. Рефакторинг = пересборка в виде сопровождаемых
исходников. Старая сборка сохранена в `legacy/`.

**Решения и причины:**
- **Бэкенд без npm-зависимостей** (`node:http`): `npm start` работает сразу
  после клонирования, нечему ломаться при установке. Node ≥ 18.
- **Прогресс хранится сервером** в `storage/progress.json` (раньше —
  localStorage): переживает чистку браузера, один источник правды.
  Атомарная запись (temp + rename), карантин повреждённых файлов.
- **Вся валидация на сервере** (`server/progress.js`); фронтенд только
  сообщает события. Это база под будущую многопользовательность.
- **Фронтенд без сборки**: ES-модули, hash-роутер, DOM через хелпер `el()`
  (текстовые узлы — XSS исключён). Дизайн — Minimal Brutalism на
  CSS-переменных, тёмная тема через `[data-theme="dark"]`.
- Исправлен техдолг: `.DS_Store` в гите, папка с пробелом в имени,
  несовпадение регистра имён ассетов (ломало Linux-хостинг).

**Функциональность:** онбординг (имя, язык en/ru/zh) → дашборд (стрик,
освоено, успех экзаменов) → практика по 26 темам (новые/ошибочные вопросы
первыми, клавиши V/F/Enter) → экзамен официального формата (30 вопросов,
20 минут, ≤3 ошибок) → разбор ошибок → настройки (язык, тема, сброс).

**Проверка:** 7 тестов `node --test`, все эндпоинты — curl, полный
пользовательский путь — headless Chromium (Playwright), скриншоты.

## 2026-06-10 — До рефакторинга
- Репозиторий создан, загружена прод-сборка «patente pro» (React, Vite)
  и данные: 7139 вопросов / 26 тем / теория 25 глав с переводами.
