import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Phase 2.1 — translation overlay skeleton.
 *
 * The question bank (data/questions/*) is frozen; localized fixes are layered
 * on top from data/translations/<category>.json. These tests prove the merge
 * rules: overlays may only touch `text` inside translations.<lang> (never the
 * source "it"), never the id / category / is_true, and a missing overlay is a
 * no-op so the plain bank still works.
 */

import { applyTranslationsOverlay, loadOverlays } from '../public/js/domain/translations.js';

function bankQuestion(id, ruText = `ru-${id}`) {
  return {
    id,
    category: 'sorpasso',
    text_it: `it-${id}`,
    is_true: true,
    image_url: null,
    translations: {
      en: { text: `en-${id}` },
      ru: { text: ruText },
      zh: { text: `zh-${id}` },
    },
  };
}

/* ---------------- applyTranslationsOverlay ---------------- */

test('overlay replaces the localized text for the languages it carries', () => {
  const qs = [bankQuestion('q-1'), bankQuestion('q-2')];
  const overlay = {
    category: 'sorpasso',
    translations: { 'q-1': { ru: { text: 'RU-FIX' }, zh: { text: 'ZH-FIX' } } },
  };
  const merged = applyTranslationsOverlay(qs, overlay);
  assert.equal(merged[0].translations.ru.text, 'RU-FIX');
  assert.equal(merged[0].translations.zh.text, 'ZH-FIX');
  // Untouched languages of the same question keep the bank text.
  assert.equal(merged[0].translations.en.text, 'en-q-1');
  assert.equal(merged[0].text_it, 'it-q-1');
  // The question without an overlay entry is unchanged (same reference).
  assert.equal(merged[1].translations.ru.text, 'ru-q-2');
  assert.equal(merged[1], qs[1]);
});

test('overlay never touches the source language "it"', () => {
  const qs = [bankQuestion('q-1')];
  const overlay = { translations: { 'q-1': { it: { text: 'EVADE' } } } };
  const merged = applyTranslationsOverlay(qs, overlay);
  assert.equal(merged[0].text_it, 'it-q-1');
  assert.equal(merged[0].translations.ru.text, 'ru-q-1');
  // Only "it" was present, so nothing legitimate changed → same array back.
  assert.equal(merged, qs);
});

test('overlay cannot change id, category or is_true', () => {
  const qs = [bankQuestion('q-1')];
  const overlay = {
    translations: { 'q-1': { ru: { text: 'OK' }, id: 'evil', is_true: false, category: 'hacked' } },
  };
  const merged = applyTranslationsOverlay(qs, overlay);
  assert.equal(merged[0].id, 'q-1');
  assert.equal(merged[0].category, 'sorpasso');
  assert.equal(merged[0].is_true, true);
  assert.equal(merged[0].translations.ru.text, 'OK');
});

test('overlay ignores non-string text and unknown ids', () => {
  const qs = [bankQuestion('q-1')];
  const overlay = {
    translations: {
      'q-1': { ru: { text: 123 }, zh: { note: 'no text field' } },
      'q-does-not-exist': { ru: { text: 'ghost' } },
    },
  };
  const merged = applyTranslationsOverlay(qs, overlay);
  // Nothing valid applied → the original array is returned untouched.
  assert.equal(merged, qs);
  assert.equal(merged[0].translations.ru.text, 'ru-q-1');
});

test('null / malformed overlay is a no-op (bank passes through)', () => {
  const qs = [bankQuestion('q-1')];
  assert.equal(applyTranslationsOverlay(qs, null), qs);
  assert.equal(applyTranslationsOverlay(qs, undefined), qs);
  assert.equal(applyTranslationsOverlay(qs, {}), qs);
  assert.equal(applyTranslationsOverlay(qs, { translations: 'nope' }), qs);
});

/* ---------------- loadOverlays (fetch wiring) ---------------- */

function fetchStub(routes) {
  return async (url) => {
    const body = routes[url];
    return {
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      json: async () => body,
    };
  };
}

test('loadOverlays merges the fetched overlay for the category', async () => {
  const qs = [bankQuestion('q-1')];
  const out = await loadOverlays(
    'sorpasso',
    qs,
    fetchStub({ '/data/translations/sorpasso.json': { translations: { 'q-1': { ru: { text: 'RU-FIX' } } } } }),
  );
  assert.equal(out[0].translations.ru.text, 'RU-FIX');
});

test('loadOverlays falls back to the plain bank when the overlay 404s', async () => {
  const qs = [bankQuestion('q-1')];
  const out = await loadOverlays('sorpasso', qs, fetchStub({}));
  assert.equal(out, qs);
  assert.equal(out[0].translations.ru.text, 'ru-q-1');
});

test('loadOverlays falls back to the plain bank when the fetch throws', async () => {
  const qs = [bankQuestion('q-1')];
  const throwing = async () => {
    throw new Error('offline');
  };
  const out = await loadOverlays('sorpasso', qs, throwing);
  assert.equal(out, qs);
});

/* ---------------- end-to-end through state.loadQuestions ---------------- */

test('state.loadQuestions serves the bank with the overlay applied', async () => {
  // Shim the browser globals before importing the module graph, which
  // instantiates the localStorage-backed store at import time.
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  if (!globalThis.document) globalThis.document = { querySelector: () => null };

  const slug = 'sorpasso';
  const bank = [bankQuestion('q-1'), bankQuestion('q-2')];
  const overlay = { category: slug, translations: { 'q-1': { ru: { text: 'RU-FIX' } } } };

  const routes = {
    [`/data/questions/${slug}.json`]: bank,
    [`/data/translations/index.json`]: [`${slug}.json`],
    [`/data/translations/${slug}.json`]: overlay,
  };
  globalThis.fetch = fetchStub(routes);

  const { state, loadQuestions } = await import('../public/js/state.js?t=1');
  state.manifest = { categories: [{ slug }] };
  state.progress = { profile: { language: 'ru' } };

  const qs = await loadQuestions(slug);
  assert.equal(qs[0].translations.ru.text, 'RU-FIX');
  assert.equal(qs[1].translations.ru.text, 'ru-q-2');

  // The merged list is cached; a second call does not re-fetch the overlay.
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => bank };
  };
  const again = await loadQuestions(slug);
  assert.equal(again, qs);
  assert.equal(calls, 0, 'overlay must not be re-fetched for a cached category');
});
