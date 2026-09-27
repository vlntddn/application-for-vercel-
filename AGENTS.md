# AGENTS.md — Patente Pro

Тренажёр итальянского экзамена на права (patente B). Node.js-бэкенд с **нулевыми
npm-зависимостями** + vanilla-JS фронтенд **без сборки**. Владелец общается на
русском; записи в `docs/DEVLOG.md` и `docs/TODO.md` — на русском, новые пишите так же.

## Команды

- `npm start` — сервер на http://127.0.0.1:3000, прогресс в `storage/`.
  **`npm install` не нужен и не существует** — node_modules не бывает.
- `npm run dev` — то же с авторестартом (`node --watch`)
- `npm test` — все тесты (`node --test`); один файл:
  `node --test tests/progress.test.js`; по имени:
  `node --test --test-name-pattern="..."`
- `npm run build` — статическая сборка `dist/` для Vercel (нужна только для
  хостинга, для локальной разработки — нет)
- `npm run fetch-images` — докачать картинки знаков (идемпотентно, нужен интернет)
- Smoke-тест перед пушем (как в CI): `node server/index.js &`, затем `curl -sf
  http://127.0.0.1:3000/api/health` и `/`, `/api/manifest`, `/api/theory`,
  `/api/lessons`, `/api/dictionary`, `/api/progress`, `/manifest.webmanifest`

CI (`.github/workflows/ci.yml`): тесты на **Node 18 и 22** + проверка «ноль
зависимостей» + smoke-тест сервера. Не используйте API, недоступные в Node 18,
и не добавляйте зависимости — CI упадёт.

## Жёсткие ограничения (их проверяет CI или тесты)

- **Ноль npm-зависимостей до Фазы 3.** Первая допустимая — драйвер SQLite
  (или встроенный `node:sqlite`), см. `docs/TODO.md`.
- **Доменная логика** (валидация прогресса, запись ответов, миграция схемы) —
  в `public/js/domain/progress.js`. Он исполняется и в браузере, и на сервере;
  `server/progress.js` — только реэкспорт. Новое правило/поля — туда, а не в
  `server/` или `public/js/` по отдельности.
- **Два режима работы**: с сервером (progress.json) и standalone (localStorage,
  Vercel). Режим определяет meta `pp-mode` в `index.html`;
  `scripts/build-static.js` штампует `content="standalone"` в сборку. Не ломайте метку
  и не делайте поведение, работающее только в одном режиме, без явной проверки режима
  (`api.js → detectMode()`).
- **Пользовательский текст в DOM — только текстовыми узлами через `el()`**
  (`public/js/ui.js`). Никакого innerHTML/eval/new Function — есть тест, который
  это проверяет.
- **Запись на диск — только через `JsonStore`** (`server/store.js`): атомарный
  write + quarantine битых файлов (`*.corrupt.<ts>`). Не пишите файлы напрямую.
- **Мутации — только через серверные эндпоинты с валидацией**; ошибка валидации =
  422. Лимиты: тело ≤ 256 KB, батч ответов ≤ 100.
- **Секреты/конфиг — только `.env`** (шаблон `.env.example`, git-ignored).
  Фронтенд ничего чувствительного не хранит; приложение вообще не требует ключей.
- **CSP жёсткий** (и в `vercel.json`, и на сервере): `script-src 'self'`,
  `connect-src 'self'`, без third-party. Не добавляйте внешние URL, шрифты, CDN,
  аналитику — это ломает и тесты, и заявленную приватность («nothing leaves the device»).
- **`data/` — read-only банк вопросов** (7139 вопросов, MIT, QuizPatenteB).
  `THIRD-PARTY-NOTICES.md` и `/credits.html` (ссылка из настроек) — обязательные
  копии лицензии, не удалять.
- **`legacy/` — не трогать** (старая скомпилированная версия).
- `.env`, `storage/`, `dist/` — git-ignored.

## Service worker

При **любом** изменении файлов в `public/` (HTML/CSS/JS/data, подаваемые из него)
поднимайте `VERSION` в `public/sw.js`, иначе пользователи получат
устаревший офлайн-кэш.

## Документация (правила проекта)

- `docs/DEVLOG.md` — **при каждой значимой работе** новая запись Сверху
  (дата, запрос, что сделано, почему).
- `docs/TODO.md` — роадмап; вычёркивайте пункты по ходу. Секция «Принятые решения
  (не пересматривать без причины)» — не пересматривайте.
- `docs/ARCHITECTURE.html` — полная архитектура с диаграммами.
- `CLAUDE.md` — те же правила для Claude Code; при расхождении обновляйте оба файла.

## Прочее

- Новая серверная логика — **обязательно с тестом** в `tests/`
  (`node --test`; security-свойства закреплены в `tests/security.test.js`).
- Имя репозитория на GitHub кончается дефисом: `application-for-vercel-.git` —
  не опечатка, не «исправляйте» URL в `package.json`/`README.md`.
- Установленные приложения держат прогресс **вне** папки приложения
  (`~/Library/Application Support/PatentePro` и т.д., таблица в README) —
  пользовательские данные в репозиторий не кладите.
- `android/` — TWA для Google Play (package `app.patentepro.twa`);
  assetlinks генерируется: `node scripts/make-assetlinks.js <отпечаток>`.
