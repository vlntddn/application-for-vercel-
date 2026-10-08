import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW_SOURCE = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
const ORIGIN = 'http://127.0.0.1:3000';

/** Load sw.js in a sandbox with fake self/caches/fetch; return its fetch handler and the URLs it fetched. */
function loadWorker() {
  const listeners = {};
  const fetched = [];
  const cache = { put: async () => {}, match: async () => undefined, addAll: async () => {} };
  const sandbox = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type, fn) => { listeners[type] = fn; },
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: { open: async () => cache, match: async () => undefined, keys: async () => [] },
    fetch: async (req) => {
      fetched.push(new URL(typeof req === 'string' ? req : req.url, ORIGIN).pathname);
      return { ok: true, clone() { return this; } };
    },
    Request: class { constructor(url) { this.url = new URL(url, ORIGIN).href; } },
    URL,
    Promise,
  };
  vm.runInNewContext(SW_SOURCE, sandbox);
  return { onFetch: listeners.fetch, fetched };
}

async function navigate(pathname) {
  const { onFetch, fetched } = loadWorker();
  let responded;
  onFetch({
    request: { method: 'GET', mode: 'navigate', url: ORIGIN + pathname },
    respondWith: (p) => { responded = p; },
  });
  await responded;
  return fetched;
}

test('navigation to /credits.html serves credits.html, not the app shell (ST1)', async () => {
  assert.deepEqual(await navigate('/credits.html'), ['/credits.html']);
});

test('navigation to /privacy.html serves privacy.html (ST1)', async () => {
  assert.deepEqual(await navigate('/privacy.html'), ['/privacy.html']);
});

test('any other navigation still serves the hash-routed shell "/"', async () => {
  assert.deepEqual(await navigate('/'), ['/']);
  assert.deepEqual(await navigate('/some/deep/link'), ['/']);
});
