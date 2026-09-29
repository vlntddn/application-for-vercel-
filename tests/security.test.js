import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { JsonStore } from '../server/store.js';
import { ProgressService, ValidationError, EMPTY_PROGRESS } from '../server/progress.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeService() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patente-sec-'));
  const store = new JsonStore(path.join(dir, 'progress.json'), EMPTY_PROGRESS).load();
  return { store, service: new ProgressService(store) };
}

// Views may live in views.js alone or be split into views/*.js modules.
// Concatenate everything so source-text tests work in both cases.
function readViewsSource() {
  const parts = [
    fs.readFileSync(path.join(ROOT, 'public', 'js', 'views.js'), 'utf8'),
  ];
  const dir = path.join(ROOT, 'public', 'js', 'views');
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).sort()) {
      if (name.endsWith('.js')) parts.push(fs.readFileSync(path.join(dir, name), 'utf8'));
    }
  }
  return parts.join('\n');
}

/* ---------------- no data can leave the device ---------------- */

test('the frontend never references an external origin', () => {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|html|css|webmanifest)$/.test(e.name)) files.push(p);
    }
  })(path.join(ROOT, 'public'));

  // Allowed: documentation links the user must click, and schema URLs.
  const allowed = [
    'https://github.com/Ed0ardo/QuizPatenteB',
    'http://www.w3.org/',
    'http://www.apple.com/DTDs/',
    'https://nodejs.org',
  ];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const url of text.match(/https?:\/\/[^\s"'`)>]+/g) ?? []) {
      if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) continue;
      if (allowed.some((a) => url.startsWith(a))) continue;
      assert.fail(`${path.relative(ROOT, file)} points at an external origin: ${url}`);
    }
  }
});

test('no analytics, beacons or remote code loaders anywhere in the frontend', () => {
  const banned = [
    /sendBeacon/,
    /google-analytics|googletagmanager|gtag\(/,
    /mixpanel|sentry|posthog|amplitude|segment\.com/i,
    /\beval\s*\(/,
    /new\s+Function\s*\(/,
    /innerHTML|outerHTML|insertAdjacentHTML|document\.write/,
  ];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|html)$/.test(e.name)) {
        const text = fs.readFileSync(p, 'utf8');
        for (const rx of banned) {
          // privacy.html and credits.html describe these words in prose.
          if (rx.test(text) && !/privacy\.html|credits\.html/.test(p)) {
            assert.fail(`${path.relative(ROOT, p)} matches banned pattern ${rx}`);
          }
        }
      }
    }
  })(path.join(ROOT, 'public'));
});

/* ---------------- headers that enforce it ---------------- */

test('the hosted build sends a CSP that forbids outbound connections', () => {
  const conf = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const headers = conf.headers.flatMap((h) => h.headers);
  const byKey = Object.fromEntries(headers.map((h) => [h.key.toLowerCase(), h.value]));

  const csp = byKey['content-security-policy'];
  assert.ok(csp, 'Content-Security-Policy header missing from vercel.json');
  for (const directive of [
    "default-src 'self'",
    "script-src 'self'",
    "connect-src 'self'", // the one that makes exfiltration impossible
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ]) {
    assert.ok(csp.includes(directive), `CSP is missing: ${directive}`);
  }
  assert.ok(!/unsafe-eval/.test(csp), 'CSP must never allow unsafe-eval');
  assert.ok(!/script-src[^;]*unsafe-inline/.test(csp), 'CSP must not allow inline scripts');

  assert.equal(byKey['x-content-type-options'], 'nosniff');
  assert.equal(byKey['referrer-policy'], 'no-referrer');
  for (const feature of ['geolocation=()', 'camera=()', 'microphone=()']) {
    assert.ok(byKey['permissions-policy'].includes(feature), `Permissions-Policy missing ${feature}`);
  }
});

test('the local server sends the same protections as the hosted build', () => {
  const source = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');
  for (const header of [
    'Content-Security-Policy',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'X-Frame-Options',
    'Permissions-Policy',
  ]) {
    assert.ok(source.includes(header), `server/index.js does not send ${header}`);
  }
  assert.ok(source.includes("connect-src 'self'"), 'server CSP must pin connect-src to self');
});

test('the server binds to localhost unless told otherwise', () => {
  const conf = fs.readFileSync(path.join(ROOT, 'server', 'config.js'), 'utf8');
  assert.match(conf, /host:\s*process\.env\.HOST\s*\|\|\s*'127\.0\.0\.1'/);
});

/* ---------------- hostile input ---------------- */

test('an imported backup cannot pollute Object.prototype', async () => {
  const { service } = makeService();
  await service.importProgress({
    answers: { __proto__: { correct: 1, wrong: 0, lastCorrect: true, pwned: true } },
  });
  assert.equal({}.pwned, undefined, 'Object.prototype was polluted');
  assert.equal(Object.prototype.pwned, undefined);

  await service.importProgress({ profile: JSON.parse('{"__proto__":{"isAdmin":true}}') });
  assert.equal({}.isAdmin, undefined, 'prototype polluted through profile');
});

test('markup in imported values is stored verbatim, never interpreted', async () => {
  const { service } = makeService();
  const payload = '<img src=x onerror=alert(1)>';
  const snap = await service.importProgress({
    profile: { name: payload, onboarded: true },
    answers: { [payload]: { correct: 0, wrong: 1, lastCorrect: false } },
    mistakes: [payload],
  });
  // The domain layer stores strings as-is; the DOM layer renders text nodes.
  assert.equal(snap.profile.name, payload);
  assert.deepEqual(snap.mistakes, [payload]);
});

test('oversized and malformed bodies are refused with a status, not a crash', async () => {
  const { readJsonBody } = await import('../server/http-helpers.js');
  const { Readable } = await import('node:stream');

  // Oversized: must reject with 413 and leave the stream drainable so the
  // response can still be written (a destroyed socket sends nothing).
  const big = Readable.from([Buffer.alloc(2048, 0x61)]);
  await assert.rejects(() => readJsonBody(big, 512), (err) => {
    assert.equal(err.status, 413);
    return true;
  });

  await assert.rejects(() => readJsonBody(Readable.from(['{ broken']), 1024), (err) => {
    assert.equal(err.status, 400);
    return true;
  });

  await assert.rejects(() => readJsonBody(Readable.from([]), 1024), (err) => {
    assert.equal(err.status, 400);
    return true;
  });
});

test('import caps the amount of work a single file can request', async () => {
  const { service } = makeService();
  const answers = {};
  for (let i = 0; i < 20001; i++) answers[`q-${i}`] = { correct: 1, wrong: 0, lastCorrect: true };
  await assert.rejects(() => service.importProgress({ answers }), ValidationError);

  const exams = Array.from({ length: 2001 }, () => ({ total: 30, errors: 0 }));
  await assert.rejects(() => service.importProgress({ exams }), ValidationError);
});

/* ---------------- the Android wrapper ---------------- */

test('the Android app asks for no permissions and no cloud backup', () => {
  const manifest = fs.readFileSync(
    path.join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8',
  );
  assert.ok(!/<uses-permission/.test(manifest), 'the app must not declare permissions');
  assert.match(manifest, /android:allowBackup="false"/);
  assert.ok(!/usesCleartextTraffic="true"/.test(manifest), 'cleartext traffic must stay disabled');

  const rules = fs.readFileSync(
    path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'xml', 'data_extraction_rules.xml'),
    'utf8',
  );
  assert.match(rules, /<cloud-backup>[\s\S]*<exclude domain="root"[\s\S]*<\/cloud-backup>/);
  assert.match(rules, /<device-transfer>[\s\S]*<exclude domain="root"[\s\S]*<\/device-transfer>/);
});

/* ---------------- iOS layout safety ---------------- */

test('the layout reserves the iPhone safe areas', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  // Without viewport-fit=cover the env() insets are always zero and the
  // fixed bottom bar leaves a strip of page showing beneath it.
  assert.match(html, /viewport-fit=cover/);

  const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
  const navBlock = css.slice(css.indexOf('.nav {', css.indexOf('@media (max-width: 760px)')));
  assert.match(navBlock.slice(0, 600), /padding-bottom:\s*env\(safe-area-inset-bottom/);
  assert.match(css, /padding-top:\s*calc\([^)]*env\(safe-area-inset-top/);
  assert.match(css, /main\s*{\s*padding:[^}]*env\(safe-area-inset-bottom/);
  assert.match(css, /min-height:\s*100dvh/);
});

/* ---------------- install-as-app readiness ---------------- */

test('iOS home-screen install markers are present', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  // Without these Safari shows a gray placeholder icon and keeps the
  // browser chrome when the user taps "Add to Home Screen".
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.match(html, /<meta name="mobile-web-app-capable" content="yes">/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="Passo">/);
  assert.match(html, /<link rel="apple-touch-icon"/);
});

test('the service worker shell covers every frontend script', () => {
  // A new public/js module that is not in the SHELL list fails offline:
  // the first cold start on a phone without network would crash boot.
  const sw = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
  const shell = sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];', sw.indexOf('const SHELL')));
  const publicJs = fs
    .readdirSync(path.join(ROOT, 'public', 'js'), { recursive: true })
    .filter((name) => String(name).endsWith('.js'));
  for (const name of publicJs) {
    assert.ok(
      shell.includes(`'/js/${name}'`),
      `public/js/${name} is missing from the service worker SHELL list`,
    );
  }
});

test('onboarding explains the exam, the learning loop and local storage', () => {
  // Phase 2.2: a first-time user must be told — in order — what the exam is,
  // how they will study here, and that nothing leaves the device.
  const views = readViewsSource();
  const onboard = views.slice(views.indexOf('ONBOARDING'));
  assert.match(onboard, /30 questions, 20 minutes, at most 3 errors/,
    'slide 1 must state the exam format in plain words');
  assert.match(onboard, /VERO or FALSO/, 'slide 2 must name the core action');
  assert.match(onboard, /theory/i, 'slide 2 must point at the theory chapters');
  assert.match(onboard, /this device only/i, 'slide 3 must say progress stays on-device');
  assert.match(onboard, /backup/i, 'slide 3 must mention the export-file escape hatch');
  // A newcomer must be able to bail out and choose the translation language
  // right in the tour — not be told "look in Settings".
  assert.match(onboard, /SKIP/, 'onboarding must offer a skip path');
  assert.match(onboard, /ob-lang/, 'language selector must live inside the tour');
  // Progress dots: one per slide, three slides.
  assert.match(onboard, /ONBOARDING_STEPS = 3/);
  // Slides 2–3: at most 2 lines of text + 1 button (Phase 2.2 subtask) —
  // a single lede, one primary forward button, no back button.
  const slide2 = onboard.slice(onboard.indexOf('step === 1'), onboard.indexOf('} else {'));
  const slide3 = onboard.slice(onboard.indexOf('} else {'));
  assert.ok(!slide2.includes('← BACK'), 'slide 2: one forward button only, no back');
  assert.ok(!slide2.includes('stat-sub'), 'slide 2: one lede line, no second paragraph');
  assert.ok(!slide3.includes('← BACK'), 'slide 3: one forward button only, no back');
});

test('the exam pre-start screen explains the format and that it is practice', () => {
  // Phase 2.2: before the timer starts, a newcomer must be told how the real
  // exam works AND be told, honestly, that this is a training run — not the
  // official exam. The content lives in renderExam's first draw (before the
  // BEGIN EXAM handler runs).
  const views = readViewsSource();
  // renderExamItalian comes first in the file — match the exact signature.
  const exam = views.slice(views.indexOf('export async function renderExam('));
  const prestart = exam.slice(0, exam.indexOf('async function start'));
  // Honest framing up front — this is the single most important sentence.
  assert.match(prestart, /THIS IS PRACTICE, NOT THE OFFICIAL EXAM/i,
    'pre-start screen must say this is a training run, not the official exam');
  // The real exam's shape, in plain words, before the clock starts.
  assert.match(prestart, /30 RANDOM QUESTIONS/i,
    'must state the 30-question count');
  assert.match(prestart, /20 MINUTES/i,
    'must state the 20-minute limit');
  assert.match(prestart, /AT MOST 3 ERRORS/i,
    'must state the 3-error pass line');
  // Navigation and translation are the two mechanics a newcomer would miss.
  assert.match(prestart, /MOVE BACK AND FORTH BETWEEN QUESTIONS/i,
    'must say you can move between questions');
  assert.match(prestart, /TRANSLATE/i,
    'must say the T / translate action reveals the user language');
});

test('the dashboard shows the next step, not raw zeros', () => {
  // Phase 2.2: a newcomer with no answers must see "what to do next" with
  // a link to practice, and a user with 1+ mock exam gets the
  // "until the exam" panel (weak topics / mistakes) instead of raw stats.
  const views = readViewsSource();
  assert.match(views, /dashboard-next-steps/);
  assert.match(views, /dashboard-exam-readiness/);
  const dashboard = views.slice(views.indexOf('export function renderDashboard'));
  // The panels are actually wired into the dashboard render.
  assert.match(dashboard, /stats\.answered === 0\s*\?\s*nextStepsPanel\(\)/,
    'no answers -> next-step panel with the practice link');
  assert.match(dashboard, /exams\.length > 0\s*\?\s*weakSpotsPanel\(\)/,
    'at least one exam -> "until the exam" panel');
});

test('settings offers an install path on phones', () => {
  const views = readViewsSource();
  assert.match(views, /renderInstallPanel/);
  const install = fs.readFileSync(path.join(ROOT, 'public', 'js', 'install.js'), 'utf8');
  // The real install mechanism on Android is beforeinstallprompt.
  assert.match(install, /beforeinstallprompt/);
  // iOS has no prompt API: written instructions are the only path.
  assert.match(install, /ADD TO HOME SCREEN/i);
});

test('settings explains where progress lives and how to back it up (S2.8a)', () => {
  const settings = fs.readFileSync(path.join(ROOT, 'public', 'js', 'views', 'settings.js'), 'utf8');
  // The "Your progress" block comes right after the profile panel.
  assert.ok(settings.indexOf('YOUR PROGRESS') > -1, 'progress panel missing');
  const clearCall = settings.slice(settings.indexOf("clear(root,"));
  assert.ok(clearCall.indexOf("profilePanel") < clearCall.indexOf("progressPanel"),
    'progress panel must come after the profile panel');
  // The four erasing cases, and the last-backup date in localStorage.
  assert.match(settings, /What erases it/);
  // The backup storage moved to the shared module (S2.8a3); settings reads it.
  const common = fs.readFileSync(path.join(ROOT, 'public', 'js', 'views', 'common.js'), 'utf8');
  assert.match(common, /pp-last-backup/);
  assert.match(settings, /readLastBackup/);
  // Export/import buttons live in the block.
  assert.match(settings, /Export backup/);
  assert.match(settings, /Import backup/);
  // The privacy strip links to the block.
  const index = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert.match(index, /href="#\/settings"[^>]*>How it's kept/);
});

test('shouldSuggestBackup decides on answers, backup age and dismissal (S2.8a3)', async () => {
  const { shouldSuggestBackup } = await import('../public/js/views/common.js');
  const now = 1_700_000_000_000;
  const daysAgo = (d) => new Date(now - d * 86400000).toISOString();
  // 1. Enough answers, never backed up, never dismissed -> suggest.
  assert.equal(shouldSuggestBackup({ answered: 50 }, null, null, now), true);
  // 2. Too few answers -> never suggest, no matter the rest.
  assert.equal(shouldSuggestBackup({ answered: 49 }, null, null, now), false);
  // 3. A recent backup (< 14 days) silences the reminder.
  assert.equal(shouldSuggestBackup({ answered: 200 }, daysAgo(3), null, now), false);
  // 4. An old backup (>= 14 days) re-enables it.
  assert.equal(shouldSuggestBackup({ answered: 200 }, daysAgo(15), null, now), true);
  // 5. "Not now" (< 7 days) silences it even with a stale backup; after 7+ days it returns.
  assert.equal(shouldSuggestBackup({ answered: 200 }, daysAgo(30), daysAgo(2), now), false);
  assert.equal(shouldSuggestBackup({ answered: 200 }, daysAgo(30), daysAgo(8), now), true);
});

test('the dashboard shows a backup reminder with Export and Not now (S2.8a3)', () => {
  const dashboard = fs.readFileSync(path.join(ROOT, 'public', 'js', 'views', 'dashboard.js'), 'utf8');
  const common = fs.readFileSync(path.join(ROOT, 'public', 'js', 'views', 'common.js'), 'utf8');
  assert.ok(dashboard.includes('backupReminderPanel()'), 'reminder panel not rendered');
  assert.ok(dashboard.includes('shouldSuggestBackup'), 'decision not driven by the pure function');
  assert.match(dashboard, /Save a backup copy — your progress lives only in this browser\./);
  assert.match(dashboard, /Not now/);
  assert.ok(common.includes('pp-backup-dismissed'), 'dismissal must be stored in localStorage');
  const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
  assert.match(css, /\.ds-callout \{/);
  assert.match(css, /\.ds-callout__action/);
});

test('install reminder decision: uninstalled iOS only, 7-day dismissal (S2.8a4)', async () => {
  const { shouldSuggestInstallReminder, isIOSUserAgent } = await import('../public/js/views/common.js');
  const now = 1_700_000_000_000;
  const iOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';
  // iOS UA + not on the Home Screen + never dismissed -> suggest.
  assert.equal(shouldSuggestInstallReminder(iOS, false, null, now), true);
  // Desktop or Android UA -> never suggest.
  assert.equal(shouldSuggestInstallReminder('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', false, null, now), false);
  assert.equal(shouldSuggestInstallReminder(android, false, null, now), false);
  assert.equal(isIOSUserAgent('iPad; CPU OS 16'), true);
  assert.equal(isIOSUserAgent('Linux; Android'), false);
  // Already on the Home Screen -> no reminder.
  assert.equal(shouldSuggestInstallReminder(iOS, true, null, now), false);
  // Dismissed recently (< 7 days) -> silence; 7+ days ago -> back.
  const daysAgo = (d) => new Date(now - d * 86400000).toISOString();
  assert.equal(shouldSuggestInstallReminder(iOS, false, daysAgo(2), now), false);
  assert.equal(shouldSuggestInstallReminder(iOS, false, daysAgo(7), now), true);
});

test('dashboard renders the iOS install callout with Not now (S2.8a4)', () => {
  const dashboard = fs.readFileSync(path.join(ROOT, 'public', 'js', 'views', 'dashboard.js'), 'utf8');
  const common = fs.readFileSync(path.join(ROOT, 'public', 'js', 'views', 'common.js'), 'utf8');
  assert.ok(dashboard.includes('installReminderPanel()'), 'callout not rendered');
  assert.ok(dashboard.includes('shouldSuggestInstallReminder'), 'decision not driven by the pure function');
  assert.ok(dashboard.includes('isInstalled'), 'must check navigator.standalone/installed');
  assert.ok(dashboard.includes('detectMode'), 'server mode must be excluded');
  assert.match(dashboard, /Not now/);
  assert.match(dashboard, /How to install/);
  assert.match(dashboard, /href: '#\/settings'/, 'must link to the Settings instructions');
  assert.ok(common.includes('pp-install-dismissed'), 'dismissal must be stored in localStorage');
  const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
  assert.match(css, /\.ds-callout__icon--bad/);
});

/* ---------------- phase 2.2: first guaranteed success ---------------- */

// views.js is a browser module; shim the bare globals it touches at import
// time so we can unit-test the queue builder without a DOM.
function loadViewsModule() {
  if (!globalThis.window) {
    globalThis.window = {
      addEventListener() {},
      removeEventListener() {},
      matchMedia: () => ({ matches: false, addEventListener() {} }),
    };
  }
  if (!globalThis.localStorage) {
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  }
  return import('../public/js/views.js');
}

function fakeQuestion(i, { image = false, len = 40 } = {}) {
  return {
    id: `fake-q-${i}`,
    category: 'fake-topic',
    text_it: 'x'.repeat(len),
    is_true: true,
    image_url: image ? `/images/${i}.png` : null,
  };
}

const EASY = 5;
const BATCH = 20;

async function topicFixture({ imageCount = 0, longCount = 0, seenCount = 0 } = {}) {
  const questions = [];
  let n = 0;
  const push = (o) => questions.push(fakeQuestion(n++, o));
  for (let i = 0; i < BATCH + 5; i++) push({});                  // 25 short text-only
  for (let i = 0; i < imageCount; i++) push({ image: true, len: 20 });
  for (let i = 0; i < longCount; i++) push({ len: 300 });
  const answers = {};
  for (let i = 0; i < seenCount; i++) {
    const q = questions.find((q) => !answers[q.id]);
    answers[q.id] = { lastCorrect: false };
  }
  return { questions, answers };
}

test('introQueue opens with only the easiest questions (short, no image, unseen)', async () => {
  const { introQueue } = await loadViewsModule();
  const { questions, answers } = await topicFixture();
  const queue = introQueue(questions, { answers });
  assert.ok(queue, 'expected a queue');
  assert.equal(queue.length, BATCH);
  const first = queue.slice(0, EASY);
  for (const q of first) {
    assert.equal(q.image_url, null, 'intro must not use sign images');
    assert.ok(q.text_it.length <= 120, 'intro must be short Italian');
    assert.equal(answers[q.id], undefined, 'intro must skip already-answered');
  }
  const ids = new Set(queue.map((q) => q.id));
  assert.equal(ids.size, BATCH, 'no duplicates in the queue');
});

test('introQueue pads the remainder with the rest of the topic, not other topics', async () => {
  const { introQueue } = await loadViewsModule();
  const { questions, answers } = await topicFixture();
  const queue = introQueue(questions, { answers });
  const ids = new Set(queue.map((q) => q.id));
  for (const q of questions) {
    if (ids.has(q.id)) assert.equal(q.category, 'fake-topic');
  }
  // 20 of 25 questions served; every id belongs to the same topic.
  assert.ok([...ids].every((id) => questions.some((q) => q.id === id)));
});

test('introQueue falls back to null when the topic is too image-heavy', async () => {
  const { introQueue } = await loadViewsModule();
  // A sign topic: 5 short text-only questions out of 25 — below the threshold.
  const questions = [];
  let n = 0;
  const push = (o) => questions.push(fakeQuestion(n++, o));
  for (let i = 0; i < 20; i++) push({ image: true, len: 10 });
  for (let i = 0; i < 4; i++) push({});
  assert.equal(introQueue(questions, { answers: {} }), null);
});

test('introQueue still serves a full batch when few easy questions remain', async () => {
  const { introQueue } = await loadViewsModule();
  // 6 easy + 30 hard: the intro block is exactly 5 questions, the rest of
  // the batch comes from the same topic in the regular order.
  const questions = [];
  let n = 0;
  const push = (o) => questions.push(fakeQuestion(n++, o));
  for (let i = 0; i < 6; i++) push({});
  for (let i = 0; i < 30; i++) push({ image: true, len: 10 });
  const queue = introQueue(questions, { answers: {} });
  assert.equal(queue.length, BATCH);
  for (const q of queue.slice(0, EASY)) assert.equal(q.image_url, null);
  const ids = new Set(queue.map((q) => q.id));
  assert.equal(ids.size, BATCH, 'no duplicates');
  assert.ok(queue.every((q) => q.category === 'fake-topic'), 'whole batch from the same topic');
});

/* ---------------- S2.8: AnswerButton component states ---------------- */

test('VERO/FALSO answers follow the AnswerButton component: neutral at rest, ok/bad/reveal after answering', () => {
  const views = readViewsSource();
  // No shake animation anywhere: wrong answers are shown on the buttons
  // themselves, not by jolting the card.
  assert.ok(!views.includes("classList.add('shake')"), 'no card-shake on wrong answers');
  assert.ok(!fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8').includes('card-shake'),
    'card-shake keyframes removed from styles.css');
  // The component states exist in the CSS (design system, not ad-hoc).
  const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
  for (const sel of ['.ds-answer--ok', '.ds-answer--bad', '.ds-answer--reveal']) {
    assert.match(css, new RegExp(sel.replace('--', '--')), `missing CSS state ${sel}`);
  }
  // Practice: buttons are neutral until the answer (state computed only in
  // the answered branch) and afterwards show icon + word.
  const practice = views.slice(views.indexOf('export function renderQuizSession('), views.indexOf('export async function renderPracticeSession('));
  assert.match(practice, /answerButtons/, 'practice renders through the answerButtons() helper');
  const restState = practice.slice(practice.indexOf("let state = ''"), practice.indexOf('if (answered)'));
  assert.ok(!restState.includes("state = 'ds-answer"), 'at rest no state is set — it may only change after the answer');
  assert.match(practice, /let state = '';[\s\S]*?if \(answered\) \{/);
  for (const token of ['ds-answer--ok', 'ds-answer--bad', 'ds-answer--reveal',
    "'Correct'", "'Wrong'", "'Right answer'"]) {
    assert.match(practice, new RegExp(token.replace(/[-']/g, (m) => `\\${m}`)), `practice missing ${token}`);
  }
  // Exam: the same states, and the old neutral "--picked" hack is gone.
  const exam = views.slice(views.indexOf('renderExam('));
  for (const token of ['ds-answer--ok', 'ds-answer--bad', 'ds-answer--reveal']) {
    assert.match(exam, new RegExp(token), `exam missing ${token}`);
  }
  assert.ok(!exam.includes('ds-answer--picked'), 'exam no longer uses the ad-hoc --picked state');
  // Both flows keep the V/F keyboard shortcuts (discoverability, not buttons only).
  assert.match(practice, /key === 'v'/);
  assert.match(exam, /'v'/);
});


