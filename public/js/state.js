import { api } from './api.js';

/** Shared app state: progress snapshot plus cached static data. */
export const state = {
  progress: null, // snapshot from /api/progress (includes stats)
  manifest: null,
  theory: null,
  dictionary: null,
  lessons: null,
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

export async function loadLessons() {
  if (!state.lessons) state.lessons = await api.lessons();
  return state.lessons;
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

/* ---------------- Offline answer queue ----------------
 * Answers given while the server is unreachable are queued in
 * localStorage and replayed in order once it responds again. The server
 * stays the single source of truth: local bookkeeping below is only an
 * optimistic mirror so the UI keeps making sense until the next sync.
 */

const QUEUE_KEY = 'pp-answer-queue';

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function pendingAnswerCount() {
  return readQueue().length;
}

/** Mirrors the server's per-answer bookkeeping on the local snapshot. */
function applyLocalAnswers(batch) {
  const d = state.progress;
  for (const { id, correct } of batch) {
    const rec = d.answers[id] ?? { correct: 0, wrong: 0, lastCorrect: false, last: '' };
    if (correct) {
      rec.correct += 1;
      d.mistakes = d.mistakes.filter((m) => m !== id);
    } else {
      rec.wrong += 1;
      if (!d.mistakes.includes(id)) d.mistakes.push(id);
    }
    rec.lastCorrect = correct;
    rec.last = new Date().toISOString();
    d.answers[id] = rec;
  }
  d.stats.answered = Object.keys(d.answers).length;
  d.stats.mastered = Object.values(d.answers).filter((a) => a.lastCorrect).length;
  d.stats.mistakes = d.mistakes.length;
}

/** Replays the queue in order. Returns true when it is fully drained. */
export async function flushAnswerQueue() {
  let queue = readQueue();
  while (queue.length) {
    const chunk = queue.slice(0, 100); // server batch cap
    try {
      state.progress = await api.recordAnswers(chunk);
    } catch (err) {
      if (err.network) return false; // still offline — keep the queue
      // Non-network rejection (validation): drop the chunk rather than
      // poison-pill the queue forever.
    }
    queue = queue.slice(chunk.length);
    writeQueue(queue);
  }
  return true;
}

/**
 * Records answers, falling back to the local queue when the server is
 * unreachable. Returns { synced } so callers can show an offline hint.
 */
export async function recordAnswersResilient(batch) {
  if (readQueue().length) {
    // Preserve order: append, mirror locally, then try to drain.
    writeQueue([...readQueue(), ...batch]);
    applyLocalAnswers(batch);
    return { synced: await flushAnswerQueue() };
  }
  try {
    state.progress = await api.recordAnswers(batch);
    return { synced: true };
  } catch (err) {
    if (!err.network) throw err;
    writeQueue([...readQueue(), ...batch]);
    applyLocalAnswers(batch);
    return { synced: false };
  }
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
