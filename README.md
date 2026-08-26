# PATENTE PRO

Trainer for the Italian driving licence theory exam (patente B):
**7139 official-style true/false questions** in 26 topics, a 25-chapter theory
manual with translations (EN / RU / 中文), mock exams in the official format,
and mistake tracking.

Local-first: a **zero-dependency Node.js backend** persists your progress on
your machine. The UI is vanilla JS styled in **Minimal Brutalism** — hard
borders, hard shadows, high contrast, sans-serif type.

## Use it on your phone

The app is also published as a static site, which a phone can install from the
browser (**Share → Add to Home Screen**). There it keeps your progress in the
phone itself — the same validated rules, no account, nothing sent anywhere.
Move progress between devices with **Settings → Backup**.

Hosting it yourself takes one import: point Vercel (or any static host) at this
repository. `vercel.json` runs `node scripts/build-static.js` and serves `dist/`.

## Install as an app

Works on **macOS, Windows and Linux**. The only prerequisite is
[Node.js](https://nodejs.org) 18 or newer — there is nothing to compile and no
npm packages to download.

### Run it right away (one command, any OS)

```bash
npx github:vlntddn/application-for-vercel-
```

Starts the server and opens the app in its own window. Nothing is installed
permanently; run it again whenever you want.

### Install with a desktop icon

This adds a `patente-pro` command plus a launcher in your applications menu
(a real `.app` bundle on macOS, a `.desktop` entry on Linux, Start Menu and
desktop shortcuts on Windows).

**macOS / Linux**

```bash
git clone https://github.com/vlntddn/application-for-vercel-.git
cd application-for-vercel- && ./install.sh
```

**Windows** (PowerShell)

```powershell
git clone https://github.com/vlntddn/application-for-vercel-.git
cd application-for-vercel-; .\install.ps1
```

> **While the repository is private** the installer has to be cloned first, as
> above, because `curl` cannot read a private raw URL. Make the repository
> public and the installers bootstrap themselves in a single command:
>
> ```bash
> curl -fsSL https://raw.githubusercontent.com/vlntddn/application-for-vercel-/main/install.sh | bash
> ```
> ```powershell
> irm https://raw.githubusercontent.com/vlntddn/application-for-vercel-/main/install.ps1 | iex
> ```

Then launch it from your applications menu, or:

```bash
patente-pro              # opens a window
patente-pro --port 8080  # a specific port (a free one is picked if taken)
patente-pro --no-open    # server only, no window
patente-pro --help
```

**Where things go**

| | Application | Your progress |
|---|---|---|
| macOS | `~/.patente-pro` + `~/Applications/Patente Pro.app` | `~/Library/Application Support/PatentePro` |
| Linux | `~/.patente-pro` | `~/.local/share/patente-pro` |
| Windows | `%LOCALAPPDATA%\PatentePro` | `%APPDATA%\PatentePro` |

Progress lives **outside** the application folder, so reinstalling or updating
never touches it. To update, re-run the installer. To remove the app:
`~/.patente-pro/uninstall.sh` (macOS/Linux) or `uninstall.ps1` (Windows) —
progress is kept unless you pass `--purge` / `-Purge`.

## Run from source

```bash
npm start        # → http://127.0.0.1:3000, progress in ./storage
npm run app      # the desktop launcher (window + per-user progress)
npm run dev      # auto-restart on changes
npm test         # built-in node:test runner
```

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
  to clear it. A missed question offers "why?" — the key facts from the
  lesson that covers it.
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
- **Backup** — export all progress to a JSON file and restore it on any
  machine; every field is validated server-side on import.
- **Settings** — name, translation language (EN/RU/ZH), light/dark theme,
  answer sounds, full progress reset.

## Credits

The 7139 questions and 413 sign images come from
[QuizPatenteB](https://github.com/Ed0ardo/QuizPatenteB) by Edoardo, used under the
MIT Licence — see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md), which also ships
inside the app at `/credits.html`. Patente Pro is an independent study aid and is not
affiliated with any government body.

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
bin/                Desktop launcher (window, port pick, per-user data dir)
  patente-pro.js    CLI entry point (npm bin, used by all installers)
  launcher-lib.js   Pure helpers — unit tested
public/             Frontend — no frameworks, no build step
  js/api.js         API client
  js/state.js       App state + data caches
  js/ui.js          DOM helpers
  js/views.js       All screens
  js/main.js        Hash router + boot
data/               Question bank (26 topics), theory manual, lessons
tests/              node:test suite (progress domain, content, launcher)
install.sh          macOS/Linux installer + .app bundle / .desktop entry
install.ps1         Windows installer + Start Menu shortcuts
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
| `POST`   | `/api/progress/import`   | Restore a backup (validated, replaces) |
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
