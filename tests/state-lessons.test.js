import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * UI2 — where did «the whole 0-step path» come from?
 *
 * Root cause confirmed by scripts/repro-ui2.mjs: data/lessons.json used to
 * exist WITHOUT a `chapters` key (before commit 1936305), and a stale
 * service worker keeps serving the old file from its `data-*` cache until
 * the new sw.js activates. If that partial payload is cached in app state,
 * the learning path reads «0 steps, all done».
 *
 * These tests drive loadLessons() exactly that way: the app module is
 * imported fresh per test (cache query param, same pattern as
 * tests/standalone.test.js) and fetch is mocked to return the stale payload.
 * A response without chapters must be REJECTED and must NOT be cached.
 */

/** Stub of api.js dependencies so state.js loads outside a browser. */
function installDomShim() {
  globalThis.document = { querySelector: () => null, documentElement: { dataset: {} } };
  if (!globalThis.localStorage) {
    const map = new Map();
    globalThis.localStorage = {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    };
  }
}

/** Mock fetch for the static-data request; `body` is the JSON payload. */
function mockFetch(body, { ok = true, status = 200 } = {}) {
  globalThis.fetch = async (url) => {
    assert.ok(String(url).includes('/data/lessons.json'), `unexpected request: ${url}`);
    return {
      ok,
      status,
      json: async () => body,
    };
  };
}

async function freshState() {
  installDomShim();
  const mod = await import(`../public/js/state.js?lessons=${Math.random()}`);
  return { mod, store: mod.state };
}

test('loadLessons rejects a payload without chapters and does not cache it', async () => {
  const { mod, store } = await freshState();
  mockFetch({ examItalian: { title_it: "L'italiano dell'esame" } }); // pre-1936305 shape

  await assert.rejects(() => mod.loadLessons(), /no chapters/);
  assert.equal(store.lessons, null, 'stale payload must not be kept in state');

  // A second call must fetch again (nothing was cached) and succeed
  // once the network returns the real data.
  const good = { chapters: { ch1: { id: 'ch1' } } };
  mockFetch(good);
  assert.deepEqual(await mod.loadLessons(), good);
});

test('loadLessons rejects an empty chapters object and does not cache it', async () => {
  const { mod, store } = await freshState();
  mockFetch({ chapters: {} });

  await assert.rejects(() => mod.loadLessons(), /no chapters/);
  assert.equal(store.lessons, null);
});

test('loadLessons rejects a non-object payload and does not cache it', async () => {
  const { mod, store } = await freshState();
  mockFetch(null); // res.json().catch(() => ({})) would turn this into {}, but
  // a bare 200 with an empty body arrives as {} — assert that path too.

  await assert.rejects(() => mod.loadLessons(), /no chapters/);
  assert.equal(store.lessons, null);
});

test('loadLessons caches a valid lessons payload', async () => {
  const { mod, store } = await freshState();
  const good = { chapters: { ch1: { id: 'ch1', title: { en: 'Ch1' } } } };
  mockFetch(good);

  assert.deepEqual(await mod.loadLessons(), good);
  assert.equal(store.lessons, good, 'valid payload is kept in state');

  // Second call: fetch must not be touched again (cached in state).
  globalThis.fetch = async () => {
    throw new Error('fetch must not be called for a cached lessons load');
  };
  assert.deepEqual(await mod.loadLessons(), good);
});
