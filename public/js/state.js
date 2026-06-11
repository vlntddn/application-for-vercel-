import { api } from './api.js';

/** Shared app state: progress snapshot plus cached static data. */
export const state = {
  progress: null, // snapshot from /api/progress (includes stats)
  manifest: null,
  theory: null,
  dictionary: null,
  questionsBySlug: new Map(),
};

export async function boot() {
  const [progress, manifest] = await Promise.all([api.progress(), api.manifest()]);
  state.progress = progress;
  state.manifest = manifest;
  applyTheme();
}

export function applyTheme() {
  document.documentElement.dataset.theme = state.progress?.profile?.theme || 'light';
}

export async function loadTheory() {
  if (!state.theory) state.theory = await api.theory();
  return state.theory;
}

export async function loadDictionary() {
  if (!state.dictionary) state.dictionary = await api.dictionary();
  return state.dictionary;
}

export async function loadQuestions(slug) {
  if (!state.questionsBySlug.has(slug)) {
    state.questionsBySlug.set(slug, await api.questions(slug));
  }
  return state.questionsBySlug.get(slug);
}

export async function loadAllQuestions(onProgress) {
  const slugs = state.manifest.categories.map((c) => c.slug);
  let done = 0;
  const lists = await Promise.all(
    slugs.map(async (slug) => {
      const qs = await loadQuestions(slug);
      onProgress?.(++done, slugs.length);
      return qs;
    }),
  );
  return lists.flat();
}

/** Finds the category slug a question id belongs to (ids are slug-prefixed). */
export function slugForQuestionId(id) {
  return (
    state.manifest.categories
      .map((c) => c.slug)
      .filter((slug) => id.startsWith(`${slug}-`))
      .sort((a, b) => b.length - a.length)[0] ?? null
  );
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
