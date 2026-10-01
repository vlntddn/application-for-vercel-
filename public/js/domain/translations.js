/**
 * Translation overlay (Phase 2.1).
 *
 * The question bank under data/questions/ is the Italian source of truth
 * and stays frozen. Localized refinements are stored per category as
 * overlay files data/translations/<category>.json that only carry the
 * fields they fix:
 *
 *   {
 *     "category": "sorpasso",
 *     "translations": {
 *       "sorpasso-q-1": { "ru": { "text": "..." }, "zh": { "text": "..." } }
 *     }
 *   }
 *
 * applyTranslationsOverlay() merges such a file onto the bank questions.
 * It is deliberately strict about what may be touched: only `text` inside
 * `translations.<lang>` (where lang is not the source language "it").
 * The question id, category, is_true and every other field are copied
 * through untouched — an overlay can correct wording, never the answer.
 */

const SOURCE_LANG = 'it';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Merges an overlay onto an array of bank questions.
 *
 * @param {object[]} questions - the category's questions from the bank.
 * @param {object} overlay - parsed data/translations/<category>.json, or null.
 * @returns {object[]} a new array; bank questions without overlay entries
 *   are passed through by reference, the rest are shallow-copied.
 */
export function applyTranslationsOverlay(questions, overlay) {
  if (!overlay || !isPlainObject(overlay.translations)) return questions;
  if (!Array.isArray(questions)) return questions;

  const byId = new Map(questions.map((q) => [q.id, q]));
  let changed = 0;

  const merged = questions.map((q) => {
    const entry = overlay.translations[q.id];
    if (!isPlainObject(entry)) return q;

    const next = { ...q };
    const translations = isPlainObject(next.translations)
      ? { ...next.translations }
      : {};
    let touched = false;

    for (const [lang, value] of Object.entries(entry)) {
      if (lang === SOURCE_LANG) continue; // the bank is already correct
      if (!isPlainObject(value) || typeof value.text !== 'string') continue;
      translations[lang] = { ...(isPlainObject(translations[lang]) ? translations[lang] : {}), text: value.text };
      touched = true;
    }

    if (!touched) return q;
    next.translations = translations;
    byId.set(q.id, next);
    changed += 1;
    return next;
  });

  // Unknown ids in the overlay must not create questions out of nothing;
  // silently drop them. (A stale overlay referencing a removed question.)
  return changed ? merged : questions;
}

/**
 * Loads and merges every category overlay in the app.
 *
 * @param {string} slug - category slug, e.g. "sorpasso".
 * @param {object[]} questions - the category's bank questions.
 * @param {(url: string) => Promise<Response>} fetchLike - the fetch used to
 *   read /data/translations/<slug>.json; 404 (no overlay yet) yields [].
 * @param {boolean} [shouldLoad=true] - request the overlay file at all. When
 *   false (the slug is not listed in index.json, Q2) no network request is
 *   made and the plain bank questions are returned untouched.
 * @returns {Promise<object[]>} the questions with the overlay applied.
 */
export async function loadOverlays(slug, questions, fetchLike, shouldLoad = true) {
  if (!shouldLoad) return questions;
  let overlay = null;
  try {
    const res = await fetchLike(`/data/translations/${slug}.json`);
    if (res.ok) overlay = await res.json();
  } catch {
    overlay = null; // offline/404 → plain bank
  }
  return applyTranslationsOverlay(questions, overlay);
}
