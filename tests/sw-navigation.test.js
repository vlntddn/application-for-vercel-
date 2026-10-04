import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW_SOURCE = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');

// Node disallows mode 'navigate' in the Request constructor — the SW only
// reads request.url and request.mode, so a plain object stands in for it.
const navReq = (pathname) => ({ url: `http://127.0.0.1${pathname}`, mode: 'navigate', method: 'GET' });

// Браузер разрешает new Request('/credits.html') относительно страницы.
// В Node такой Request кидает — оборачиваем конструктор тем же base-URL.
// Обычная функция (не arrow): sw.js вызывает её через `new Request(...)`.
function BrowserRequest(input, init) {
  return new globalThis.Request(typeof input === 'string' ? new URL(input, 'http://127.0.0.1').href : input, init);
}
/**
 * Поднимает sw.js в node:vm с поддельным self/caches/fetch и возвращает:
 *  - navigateTargets: URL'ы, на которые обращался fetch при навигационных запросах
 *  - respondTargets:  pathname ответа (Request) в event.respondWith
 */
function runSw() {
  const navigateTargets = [];
  const respondTargets = [];

  // Кэш: match() по Request → ответ только если он «закеширован» (для
  // офлайн-ветки). put() помнит; addAll при install — тоже.
  const cached = new Set();
  const cachesApi = {
    open: async () => ({
      addAll: async (urls) => { for (const u of urls) cached.add(new URL(u, 'http://127.0.0.1').pathname); },
      put: async (req) => { cached.add(new URL(req.url).pathname); },
      match: async (req) => (cached.has(new URL(req.url).pathname) ? { fromCache: new URL(req.url).pathname } : undefined),
    }),
    keys: async () => ['shell-x', 'data-x'],
    delete: async () => true,
    match: async (req) => (cached.has(new URL(req.url).pathname) ? { fromCache: new URL(req.url).pathname } : undefined),
  };

  const fetchImpl = async (req) => {
    // Браузер resolve'ит относительные Request'и от URL страницы;
    // new Request('/') в Node падает, поэтому эмулируем base-URL.
    // Записываем ВСЕ fetch'и: в navigate-ветке sw.js шлёт обычный
    // (не navigate) Request, и именно его URL проверяем в тестах.
    const href = typeof req === 'string' ? req : req.url.startsWith('http') ? req.url : new URL(req.url, 'http://127.0.0.1').href;
    navigateTargets.push(new URL(href).pathname);
    return { ok: true, status: 200, clone: () => ({}) };
  };

  const listeners = {};
  const selfMock = {
    location: { origin: 'http://127.0.0.1' },
    addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };

  vm.runInNewContext(SW_SOURCE, {
    self: selfMock,
    caches: cachesApi,
    fetch: fetchImpl,
    Request: BrowserRequest,
    URL,
    Promise,
  });

  const emit = (name, event) =>
    Promise.all((listeners[name] || []).map((fn) => fn(event)).filter(Boolean));

  return {
    navigateTargets,
    respondTargets,
    async boot() {
      // install: наполняет SHELL_CACHE (credits/privacy — в SHELL)
      await emit('install', { waitUntil: async (p) => p });
    },
    async navigate(pathname) {
      let captured = null;
      const event = {
        request: navReq(pathname),
        respondWith: (p) => { captured = p; },
      };
      await emit('fetch', event);
      const result = await captured;
      if (result && result.fromCache) respondTargets.push(result.fromCache);
      return captured;
    },
  };
}

test('navigate /credits.html запрашивает /credits.html, не "/"', async () => {
  const sw = runSw();
  await sw.boot();
  await sw.navigate('/credits.html');
  assert.deepEqual(sw.navigateTargets, ['/credits.html']);
});

test('navigate / — как раньше, "/" (hash-роутинг)', async () => {
  const sw = runSw();
  await sw.boot();
  await sw.navigate('/');
  assert.deepEqual(sw.navigateTargets, ['/']);
});

test('navigate /privacy.html запрашивает /privacy.html', async () => {
  const sw = runSw();
  await sw.boot();
  await sw.navigate('/privacy.html');
  assert.deepEqual(sw.navigateTargets, ['/privacy.html']);
});

test('офлайн: navigate /credits.html без сети — ответ из SHELL_CACHE, URL тот же', async () => {
  const sw = runSwOffline();
  await sw.boot();
  await sw.navigate('/credits.html');
  assert.equal(sw.navigateTargets[0], '/credits.html', 'запрос шёл на /credits.html');
  assert.ok(sw.respondTargets.includes('/credits.html'), 'офлайн-ответ — из кэша /credits.html, а не "/"');
});

function runSwOffline() {
  const navigateTargets = [];
  const respondTargets = [];
  const cached = new Set();
  const cachesApi = {
    open: async () => ({
      addAll: async (urls) => { for (const u of urls) cached.add(new URL(u, 'http://127.0.0.1').pathname); },
      put: async () => {},
      match: async (req) => (cached.has(new URL(req.url).pathname) ? { fromCache: new URL(req.url).pathname } : undefined),
    }),
    keys: async () => [],
    delete: async () => true,
    match: async (req) => (cached.has(new URL(req.url).pathname) ? { fromCache: new URL(req.url).pathname } : undefined),
  };
  // Сеть «вырублена»: fetch всегда падает — срабатывает кэш-фолбэк.
  // Относительные Request'и (new Request('/credits.html')) резолвим, как браузер.
  const fetchImpl = async (req) => {
    const href = req.url.startsWith('http') ? req.url : new URL(req.url, 'http://127.0.0.1').href;
    navigateTargets.push(new URL(href).pathname);
    throw new Error('offline');
  };
  const listeners = {};
  const selfMock = {
    location: { origin: 'http://127.0.0.1' },
    addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  vm.runInNewContext(SW_SOURCE, { self: selfMock, caches: cachesApi, fetch: fetchImpl, Request: BrowserRequest, URL, Promise });
  const emit = (name, event) =>
    Promise.all((listeners[name] || []).map((fn) => fn(event)).filter(Boolean));
  return {
    navigateTargets,
    respondTargets,
    boot: () => emit('install', { waitUntil: async (p) => p }),
    async navigate(pathname) {
      let captured;
      await emit('fetch', {
        request: navReq(pathname),
        respondWith: (x) => (captured = x),
      });
      const result = await captured;
      if (result && result.fromCache) respondTargets.push(result.fromCache);
      return captured;
    },
  };
}

test('standalone-список — одна константа STANDALONE_PAGES', () => {
  assert.match(SW_SOURCE, /const STANDALONE_PAGES\s*=\s*\[[^\]]*\/credits\.html[^\]]*\/privacy\.html[^\]]*\]/s);
});
