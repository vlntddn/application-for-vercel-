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
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="Patente Pro">/);
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
  const views = fs.readFileSync(path.join(ROOT, 'public', 'js', 'views.js'), 'utf8');
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

test('the dashboard shows the next step, not raw zeros', () => {
  // Phase 2.2: a newcomer with no answers must see "what to do next" with
  // a link to practice, and a user with 1+ mock exam gets the
  // "until the exam" panel (weak topics / mistakes) instead of raw stats.
  const views = fs.readFileSync(path.join(ROOT, 'public', 'js', 'views.js'), 'utf8');
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
  const views = fs.readFileSync(path.join(ROOT, 'public', 'js', 'views.js'), 'utf8');
  assert.match(views, /renderInstallPanel/);
  const install = fs.readFileSync(path.join(ROOT, 'public', 'js', 'install.js'), 'utf8');
  // The real install mechanism on Android is beforeinstallprompt.
  assert.match(install, /beforeinstallprompt/);
  // iOS has no prompt API: written instructions are the only path.
  assert.match(install, /ADD TO HOME SCREEN/);
});
