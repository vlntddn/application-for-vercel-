# Google Play — путь к публикации

Приложение выходит в Play как **Trusted Web Activity (TWA)** — официальный
механизм Google для установки PWA из стора. Это не «обёртка-вебвью»: TWA
запускает наш сайт в Chrome без адресной строки, с нашей иконкой и splash-экраном.

⚠️ **Перед публикацией нужно решить вопрос лицензии банка вопросов**
(источник QuizPatenteB). Для личного пользования это не проблема, но публикация
7139 чужих вопросов в сторе — это распространение, и права на него нужны.

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
| Android-проект (.aab) | ⏳ следующий шаг |

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

## Шаг 3. Digital Asset Links (иначе будет видна адресная строка)

1. При первой сборке Play создаст ключ подписи (**Play App Signing**).
2. В Play Console: *Release → Setup → App signing* — скопировать
   **SHA-256 certificate fingerprint**.
3. Создать файл `public/.well-known/assetlinks.json` по шаблону
   `docs/store/assetlinks.template.json`, подставив отпечаток и package name.
4. Задеплоить. Проверить: `https://<домен>/.well-known/assetlinks.json`
   должен отдаваться как JSON.

Если отпечаток не совпадёт — приложение откроется с адресной строкой Chrome
сверху. Это самый частый косяк при первом релизе TWA.

## Шаг 4. Сборка .aab

Android-проект генерируется из манифеста PWA. Нужны JDK 17 и Android SDK.

```bash
# самый простой путь — Bubblewrap от Google
npx @bubblewrap/cli init --manifest https://<домен>/manifest.webmanifest
npx @bubblewrap/cli build
# → app-release-bundle.aab, его и загружают в Play Console
```

Bubblewrap — инструмент сборки, а не зависимость приложения: в `package.json`
он не добавляется, правило «ноль зависимостей» не нарушается.

Package name предлагается: `app.patentepro.twa` (менять после публикации нельзя).

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
