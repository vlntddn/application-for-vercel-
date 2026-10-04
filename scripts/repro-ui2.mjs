/**
 * UI2 — why did a brand-new profile read «All steps done / the whole
 * 0-step path» in Safari?
 *
 * Reproduction, exactly as the task describes: open `#/`
 *   (A) with an empty cache while the network serves an OLD lessons.json
 *       that has no `chapters` key (the real file looked like that before
 *       commit 1936305), and
 *   (B) with a stale `/data/lessons.json` planted in `caches` and the
 *       network cut — what a not-yet-activated old service worker does.
 * Expected after the guard: the dashboard shows the practice / next-steps
 * flow, and #/path shows a reload error banner — never «All steps done».
 *
 * The fetch/caches patch is installed with Page.addScriptToEvaluateOnNewDocument
 * so it survives the app's hash navigation and full reloads.
 *
 * Own server on :3922 with a temp STORAGE_DIR; the owner's :3000 is
 * untouched. Not in npm test — it needs Chrome (same as qa-ux.mjs).
 *
 * Run: node scripts/repro-ui2.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = '9335'; // qa-new-user / qa-ux use 9333 — stay clear
const DEV = `http://127.0.0.1:${CDP_PORT}`;
const PORT = process.env.UI2_PORT || '3922';
const APP = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const log = (s) => console.log(`[ui2] ${s}`);
let passes = 0, failures = 0;
function check(cond, name) {
  if (cond) { passes++; log(`PASS — ${name}`); }
  else { failures++; log(`FAIL — ${name}`); }
}

// The file as it existed before chapters were added (commit 99f433f era).
const STALE_LESSONS = {
  examItalian: {
    title_it: "L'italiano dell'esame",
    intro: { en: 'Old intro without chapters.', it: 'Vecchia intro senza capitoli.', ru: 'Старая вводная без глав.' },
  },
};

const FORBIDDEN = ['All steps done', 'the whole 0-step path', '0-step path'];

const portTaken = await new Promise((res) => {
  const s = net.createServer();
  s.once('error', () => res(true));
  s.once('listening', () => s.close(() => res(false)));
  s.listen(Number(PORT), '127.0.0.1');
});
if (portTaken) { console.error(`[ui2] ОШИБКА: порт ${PORT} занят`); process.exit(1); }

const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-ui2-storage-'));
const chromeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-ui2-chrome-'));
const ownServer = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT, env: { ...process.env, PORT, STORAGE_DIR: storage }, stdio: 'ignore',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let up = false;
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`${APP}/api/health`)).ok) { up = true; break; } } catch {}
  await sleep(200);
}
if (!up) { console.error('[ui2] ОШИБКА: сервер не поднялся'); process.exit(1); }

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${chromeDir}`, '--no-first-run', '--no-default-browser-check',
  '--disable-features=Translate', '--window-size=375,812', 'about:blank',
], { stdio: 'ignore' });

/* ---- CDP (same stdlib-WebSocket pattern as qa-new-user.mjs) ---- */
let ws, seq = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = (expression, awaitPromise = false) =>
  send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })
    .then((r) => {
      if (r.exceptionDetails) throw new Error(`JS: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      return r.result.value;
    });

async function connectTab(url) {
  for (let i = 0; i < 40; i++) {
    try { await fetch(`${DEV}/json/version`); break; } catch { await sleep(500); }
  }
  const tabRes = await fetch(`${DEV}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const tab = await tabRes.json();
  const target = (await (await fetch(`${DEV}/json`)).json()).find((x) => x.id === tab.id);
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('ws fail')); });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(`CDP: ${m.error.message}`)) : resolve(m.result);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
}

const viewText = () => evaluate(`document.getElementById('view')?.innerText || ''`);

async function waitSettled(timeout = 20000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const n = await evaluate(`(document.getElementById('view')?.innerText || '').length`);
    if (n > 40) return;
    if (Date.now() > deadline) throw new Error('timeout waiting for view to render');
    await sleep(300);
  }
}

/** Change the hash without a document reload (app is a hash router). */
async function navTo(hash) {
  await evaluate(`location.hash = ${JSON.stringify(hash)}; true`);
  await waitSettled();
}

/** Reset stored progress to a fresh profile that is past onboarding,
 *  server-side, BEFORE the app boots. Import replaces the whole progress,
 *  so this is a deterministic reset. */
async function resetOnboarded() {
  const r = await fetch(`${APP}/api/progress/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: { language: 'en', onboarded: true } }),
  });
  if (!r.ok) throw new Error(`progress import: ${r.status}`);
}

/** Scenario A: empty cache; the network answers /data/lessons.json with the
 *  pre-chapters file (what an old origin/deploy still serves). */
async function scenarioA() {
  await resetOnboarded();
  await connectTab('about:blank');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => {
      if (window.__ui2A) return;
      window.__ui2A = true;
      const stale = ${JSON.stringify(STALE_LESSONS)};
      const realFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        const url = String((input && input.url) || input);
        if (url.endsWith('/data/lessons.json')) {
          return Promise.resolve(new Response(JSON.stringify(stale), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          }));
        }
        return realFetch(input, init);
      };
    })()
  `});
  await send('Page.navigate', { url: `${APP}/#/` });
  await waitSettled();
  const dash = await viewText();
  for (const s of FORBIDDEN) check(!dash.includes(s), `A: главная (пустой кэш, старые данные) без «${s}»`);

  await navTo('#/path');
  const pathText = await viewText();
  for (const s of FORBIDDEN) check(!pathText.includes(s), `A: #/path без «${s}»`);
  check(/did not load|reload/i.test(pathText), 'A: #/path — баннер «данные не загрузились, перезагрузите»');
}

/** Scenario B: stale lessons.json planted in `caches`, network cut —
 *  exactly what an old, not-yet-activated service worker hands out. */
async function scenarioB() {
  await resetOnboarded();
  // Fresh target: scenario A's fetch patch must not survive into B.
  const res = await fetch(`${DEV}/json/close/${(await (await fetch(`${DEV}/json`)).json()).find((x) => x.type === 'page')?.id}`);
  await res.text();
  await sleep(300);
  await connectTab('about:blank');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => {
      if (window.__ui2B) return;
      window.__ui2B = true;
      const stale = ${JSON.stringify(STALE_LESSONS)};
      const staleBody = JSON.stringify(stale);
      const seed = async () => {
        const cache = await caches.open('data-v1');
        const staleResp = () => new Response(staleBody, {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
        await cache.put('/data/lessons.json', staleResp());
        try { await cache.put('${APP}/data/lessons.json', staleResp()); } catch {}
      };
      const realFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        const url = String((input && input.url) || input);
        if (url.endsWith('/data/lessons.json')) {
          // Old SW: cache first, and the network never refreshes it.
          return seed().then(() => caches.open('data-v1')).then((c) =>
            c.match('/data/lessons.json')).then((r) => {
              if (r) return r;
              return Promise.reject(new TypeError('stale SW: no network for /data/*'));
            });
        }
        return realFetch(input, init);
      };
    })()
  `});
  await send('Page.navigate', { url: `${APP}/#/` });
  await waitSettled();
  const dash = await viewText();
  for (const s of FORBIDDEN) check(!dash.includes(s), `B: главная (старый SW, кэш) без «${s}»`);

  await navTo('#/path');
  const pathText = await viewText();
  for (const s of FORBIDDEN) check(!pathText.includes(s), `B: #/path без «${s}»`);
  check(/did not load|reload/i.test(pathText), 'B: #/path — баннер «данные не загрузились, перезагрузите»');
}

try {
  await scenarioA();
  await scenarioB();
} catch (err) {
  failures++;
  log(`FAIL — сценарий упал: ${err.message}`);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
  ownServer.kill();
}
console.log(`[ui2] ИТОГО: ${passes} PASS, ${failures} FAIL`);
process.exit(failures > 0 ? 1 : 0);
