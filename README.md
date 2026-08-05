# PATENTE PRO

Trainer for the Italian driving licence theory exam (patente B):
**7139 official-style true/false questions** in 26 topics, a 25-chapter theory
manual with translations (EN / RU / 中文), mock exams in the official format,
and mistake tracking.

Local-first: a **zero-dependency Node.js backend** persists your progress on
your machine. The UI is vanilla JS styled in **Minimal Brutalism** — hard
borders, hard shadows, high contrast, sans-serif type.

## Quick start

Requires Node.js ≥ 18. No `npm install` needed — there are no runtime dependencies.

```bash
npm start
# → PATENTE PRO running at http://127.0.0.1:3000
```

Development mode (auto-restart on changes): `npm run dev`.
Tests (built-in `node:test` runner): `npm test`.

## Features

- **Dashboard** — login streak, questions mastered, mock-exam success rate.
- **Theory** — 25 chapters; original Italian, translation, and a simplified version.
- **Lessons for foreigners** — instructor-designed layer on all 25 chapters:
  key ideas in your language, must-know facts, and real trap questions
  dissected; plus "L'italiano dell'esame" — a guide to the wording
  (sempre/mai/solo, deve vs può) that decides VERO or FALSO.
- **Practice** — per-topic sessions of 20 questions; unseen and previously
  wrong questions are served first; instant feedback; keyboard controls
  (`V` = vero, `F` = falso, `Enter` = next).
- **Mock exam** — official format: 30 questions, 20 minutes, max 3 errors;
  question navigator, countdown, full error report.
- **Mistakes** — every question you last answered wrong; answer it correctly
  to clear it.
- **Quick review** — a smart 10-question daily session: mistakes first,
  then your weakest topics, then long-unseen questions for retention.
- **Search** — full-text across all 7139 questions in Italian and your
  language, accent-insensitive; practice the results as a session.
- **Dictionary** — exam vocabulary in 9 thematic sections (107 terms,
  EN/RU/ZH) with a self-test mode; sign descriptions on tap, built from
  true statements in the question bank.
- **Progress & stats** — per-topic accuracy and mastery, weak-spot ranking
  with one-tap practice, and a mock-exam trend chart.
- **Installable PWA** — add to home screen; "download for offline" in
  Settings caches the full question bank, theory and images (~8 MB).
  Answers given offline queue locally and sync when the server returns.
- **Settings** — name, translation language (EN/RU/ZH), light/dark theme,
  full progress reset.

## Configuration

Via environment variables or an optional `.env` file (see `.env.example`).
**No secrets or configuration live in frontend code**, and `.env` is git-ignored.

| Variable      | Default     | Purpose                                      |
|---------------|-------------|----------------------------------------------|
| `HOST`        | `127.0.0.1` | Interface the server binds to                 |
| `PORT`        | `3000`      | Port the server listens on                    |
| `STORAGE_DIR` | `storage`   | Where `progress.json` is stored (git-ignored) |

## Architecture

```
server/             Zero-dependency backend (node:http)
  index.js          Routing, error handling, graceful shutdown
  config.js         .env loader + validated configuration
  store.js          Atomic JSON persistence + corrupt-file quarantine
  progress.js       All progress logic & validation (answers, exams, streak)
  http-helpers.js   JSON responses, body parsing with size limit
  static.js         Static/data file serving with path-traversal protection
public/             Frontend — no frameworks, no build step
  js/api.js         API client
  js/state.js       App state + data caches
  js/ui.js          DOM helpers
  js/views.js       All screens
  js/main.js        Hash router + boot
data/               Question bank (26 topics), theory manual, manifest
tests/              node:test suite for the progress domain
legacy/             Previous compiled build (kept for reference — no source existed)
```

## API

| Method   | Path                     | Description                            |
|----------|--------------------------|----------------------------------------|
| `GET`    | `/api/health`            | Liveness check                         |
| `GET`    | `/api/manifest`          | Topic list + question counts           |
| `GET`    | `/api/theory`            | Theory manual                          |
| `GET`    | `/api/dictionary`        | Exam vocabulary by topic               |
| `GET`    | `/api/questions/:slug`   | Questions for a topic (whitelisted)    |
| `GET`    | `/api/progress`          | Full progress snapshot + derived stats |
| `PUT`    | `/api/progress/profile`  | Update name / language / theme         |
| `POST`   | `/api/progress/answers`  | Record a batch of answers (≤100)       |
| `POST`   | `/api/progress/exams`    | Record a mock-exam result              |
| `POST`   | `/api/progress/theory`   | Mark a chapter as read                 |
| `DELETE` | `/api/progress`          | Reset all progress                     |

Invalid input returns `422` with a JSON error; malformed/oversized bodies
return `400`/`413`.

## Reliability & security notes

- **Atomic persistence** — progress writes go to a temp file then `rename`;
  a crash can never leave a half-written file. Writes are serialized.
- **Corrupt-file quarantine** — an unreadable `progress.json` is moved aside
  (`progress.json.corrupt.<timestamp>`) instead of crashing or being wiped.
- **Server-side validation** of every mutation (enums, lengths, batch caps,
  body size limit 256 KB); question slugs are whitelisted via the manifest.
- **Path-traversal protection** on file serving; binds to `127.0.0.1` by
  default so nothing is exposed to the network.
- **No secrets in the frontend** — and none anywhere: the app needs no keys.
- **Fully self-contained** — all 413 sign images are stored locally in
  `data/images/` (refresh with `npm run fetch-images`); the app works with
  no internet connection at all.
- **Graceful shutdown** — `SIGINT`/`SIGTERM` flush pending writes before exit.
