# Google Play — путь к публикации

Приложение выходит в Play как **Trusted Web Activity (TWA)** — официальный
механизм Google для установки PWA из стора. Это не «обёртка-вебвью»: TWA
запускает наш сайт в Chrome без адресной строки, с нашей иконкой и splash-экраном.

**Лицензия банка вопросов проверена:** источник Ed0ardo/QuizPatenteB —
**MIT, © 2023 Edoardo**. Коммерческое использование и распространение
разрешены при условии, что копия лицензии идёт с приложением: это сделано
(`THIRD-PARTY-NOTICES.md` и `/credits.html`, ссылка из Settings → ABOUT).

Остаётся отдельный вопрос: MIT покрывает работу Edoardo, а сами тексты
вопросов — министерские. Обычное основание для их воспроизведения —
Legge 633/1941 art. 5 (тексты официальных актов государства вне авторского
права), но это не юридическая консультация. Перед коммерческим релизом
стоит подтвердить у юриста.

---

## Что уже готово в репозитории

| Требование Play | Статус |
|---|---|
| PWA с офлайн-режимом и HTTPS | ✅ `dist/`, service worker v11 |
| Иконка 512×512 | ✅ `public/icons/icon-512.png` |
| Adaptive-иконка (maskable) | ✅ `public/icons/icon-maskable-512.png` |
| Feature graphic 1024×500 | ✅ `docs/store/feature-graphic-1024x500.png` |
| Скриншоты телефона (мин. 2) | ✅ 4 шт., 1080×1920, `public/screenshots/` |
| Политика приватности по URL | ✅ `public/privacy.html` → `https://<домен>/privacy.html` |
| Манифест с `id`, `orientation`, `screenshots` | ✅ `public/manifest.webmanifest` |
| Digital Asset Links | ⏳ нужен отпечаток ключа — см. шаг 3 |
| Android-проект TWA | ✅ `android/` — собрать `./gradlew bundleRelease` |
| Лицензия банка вопросов | ✅ MIT, атрибуция добавлена (см. ниже) |

---

## Шаг 1. Аккаунт разработчика

- Регистрация: **$25 единоразово**, https://play.google.com/console
- Тип аккаунта: **личный** или **организация**. Для личного Google требует
  подтверждение личности документом.
- ⚠️ Для **новых личных аккаунтов** Google требует **закрытое тестирование:
  минимум 12 тестировщиков непрерывно в течение 14 дней**, прежде чем откроют
  доступ к продакшену. Это не формальность — 12 реальных аккаунтов Google,
  которые примут приглашение. Планируйте это заранее (друзья, коллеги).
  Актуальные правила смотрите в Play Console — они меняются.

## Шаг 2. Домен

TWA привязывается к домену. Сейчас это `application-for-vercel.vercel.app`.
Можно оставить, но для стора лучше свой домен (например `patentepro.app`):
он не зависит от хостинга и выглядит солиднее в листинге.
Домен подключается в Vercel → Settings → Domains.

⚠️ **Смена домена обнуляет прогресс в браузере.** localStorage принадлежит
конкретному origin: пользователи со старого адреса на новом увидят пустой
профиль. Если на текущем адресе уже кто-то занимается — предупредите их
сделать **Settings → Backup → Export**, а на новом адресе импортировать.
Лучше определиться с доменом до того, как появятся живые пользователи.

## Шаг 3. Сборка .aab (Android SDK у вас уже есть)

Проект TWA лежит в репозитории: **`android/`**. Он написан вручную и
закоммичен — версии зафиксированы, ничего не генерируется на лету.

```bash
cd android

# 1. Ключ подписи (один раз; храните его — потерять нельзя)
keytool -genkey -v -keystore patente-pro-release.jks \
        -keyalg RSA -keysize 2048 -validity 10000 -alias patente-pro

# 2. Прописать пароли
cp keystore.properties.example keystore.properties   # и заполнить

# 3. Указать, где Android SDK
echo "sdk.dir=/путь/к/Android/Sdk" > local.properties

# 4. Собрать
gradle wrapper           # если нет ./gradlew
./gradlew bundleRelease
# → app/build/outputs/bundle/release/app-release.aab
```

Что уже настроено: package `app.patentepro.twa`, versionCode 1,
compileSdk/targetSdk 35, minSdk 21, портретная ориентация, иконки во всех
плотностях + adaptive-иконка, splash в цветах приложения, никаких
разрешений (приложение ничего не запрашивает).

`keystore.properties`, `*.jks` и `local.properties` — в `.gitignore`,
в репозиторий не попадут.

⚠️ Если SDK не содержит platform 35 — Gradle скажет об этом прямо;
доустановите через SDK Manager или понизьте `compileSdk`/`targetSdk`
(но Play требует свежий targetSdk для новых приложений).

**Альтернатива:** `npx @bubblewrap/cli init --manifest https://<домен>/manifest.webmanifest`
сгенерирует свой проект. Наш уже готов, так что это только запасной путь.

## Шаг 4. Digital Asset Links (иначе будет видна адресная строка)

1. Загрузите первый `.aab` в Play Console — Google создаст ключ подписи
   (**Play App Signing**).
2. *Release → Setup → App signing* → скопировать **SHA-256 certificate
   fingerprint** (именно ключа Google, а не upload-ключа).
3. Сгенерировать файл и задеплоить:

```bash
node scripts/make-assetlinks.js "AB:CD:...:12"
git add public/.well-known/assetlinks.json && git commit -m "Add asset links" && git push
```

4. Проверить: `curl https://<домен>/.well-known/assetlinks.json` отдаёт JSON.

Если отпечаток не совпадёт — приложение откроется с адресной строкой Chrome
сверху. Это самый частый косяк первого релиза TWA.

## Шаг 5. Листинг в сторе

**Название (≤30 символов):**
```
Patente Pro: Italian Theory
```

**Краткое описание (≤80 символов):**
```
7139 official-style questions, 25 lessons and mock exams. Works fully offline.
```

**Полное описание (≤4000 символов):**
```
Prepare for the Italian driving licence theory exam (patente B) — and actually
understand what the questions are asking.

Most people don't fail the quiz because they don't know the rules. They fail
because of how the questions are worded: one small word like "sempre", "mai" or
"solo" flips a true statement into a false one. Patente Pro is built around that
problem.

WHAT'S INSIDE
• 7139 official-style true/false questions across 26 topics
• Mock exams in the real format: 30 questions, 20 minutes, 3 errors allowed
• 25 theory lessons written for people who don't speak Italian, with key ideas
  in English, Russian or Chinese — and the terms kept in Italian
• "The Italian of the exam": a guide to the words that decide VERO or FALSO
• Real trap questions from the bank, dissected one by one
• Every road sign explained, built from the true statements about it
• An exam vocabulary of 107 terms with a self-test mode

HOW IT HELPS YOU IMPROVE
• Practice by topic — unseen and previously wrong questions come first
• Quick review: a daily 10-question session built from your mistakes and your
  weakest topics
• Statistics that show exactly which topics are holding you back
• Every mistake is tracked until you answer it correctly
• Miss a question and the app shows the key facts from the lesson that covers it

BUILT TO RESPECT YOU
• Works completely offline — questions, lessons and all 413 sign images are on
  your device
• No account, no sign-in, no ads, no tracking, no analytics
• Your progress never leaves your phone; export a backup file whenever you want
• Translations are hidden by default, so you learn to read the original Italian

Patente Pro is a study aid. It is not affiliated with any government body, and
practice results do not guarantee the outcome of the real exam.
```

**Категория:** Education
**Теги:** education, exam preparation
**Политика приватности:** `https://<домен>/privacy.html`

## Шаг 6. Обязательные формы в консоли

- **Data safety**: выбрать «No data collected» / «No data shared».
  Отдельно упомянуть, что данные хранятся только на устройстве.
  (Логи хостинга — это не сбор данных приложением, но политика их описывает.)
- **Content rating**: анкета → приложение образовательное, без насилия,
  без пользовательского контента, без покупок. Ожидаемый рейтинг: 3+ / Everyone.
- **Target audience**: 18+ (экзамен на права), значит правила для детей не применяются.
- **Ads**: нет.
- **Government app**: нет (важно ответить честно — приложение НЕ официальное).

## Риск, о котором стоит знать

Политика Play **Minimum Functionality** отклоняет приложения, которые лишь
показывают сайт и не дают ничего сверх браузера. TWA поверх настоящего
офлайн-PWA обычно проходит — у нас офлайн-режим, локальные данные и полноценная
логика без сети, это и есть аргумент. Но если ревью придерётся, ответ —
подчеркнуть офлайн-работу и отсутствие сети в основном сценарии.
