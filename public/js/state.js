import { api, detectMode } from './api.js';
import { loadOverlays } from './domain/translations.js';
import { REVIEW_INTERVALS, MASTERY_STREAK, addDays, dueReviewCount } from './domain/progress.js';

/** Shared app state: progress snapshot plus cached static data. */
export const state = {
  progress: null, // snapshot from /api/progress (includes stats)
  manifest: null,
  theory: null,
  dictionary: null,
  lessons: null,
  insights: null,
  numbers: null,
  numbersGlossary: null,
  questionsBySlug: new Map(),
  // Per-category explanation files (L9a); a Map of slug -> {items}. A missing
  // file caches as an empty object so repeated loads are cheap.
  explanationsBySlug: new Map(),
  // Overlay indexes (Q2): Set of "<slug>.json" per kind, from index.json.
  // null = not fetched yet; an empty Set = fetched, nothing to request.
  translationSlugs: null,
  explanationSlugs: null,
};

export async function boot() {
  await detectMode(); // decides whether progress lives on a server or here
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
  if (!state.lessons) {
    const lessons = await api.lessons();
    // A response without chapters (stale or partial cache) must not be kept:
    // the learning path would read «0 steps, all done».
    if (!lessons || !lessons.chapters || Object.keys(lessons.chapters).length === 0) {
      throw new Error('lessons data has no chapters — reload the page');
    }
    state.lessons = lessons;
  }
  return state.lessons;
}

export async function loadInsights() {
  if (!state.insights) state.insights = await api.insights();
  return state.insights;
}

/** Learner-language glossary for #/numbers; never throws — the page falls back to the Italian rows. */
export async function loadNumbersGlossary() {
  if (!state.numbersGlossary) {
    try { state.numbersGlossary = (await api.numbersGlossary()).entries || {}; } catch { state.numbersGlossary = {}; }
  }
  return state.numbersGlossary;
}

export async function loadNumbers() {
  if (!state.numbers) state.numbers = await api.numbers();
  return state.numbers;
}

/**
 * Fetches an overlay index (Q2): the JSON array of "<slug>.json" basenames
 * that actually exist under the given data directory. Used to skip per-category
 * overlay requests for slugs with no file, killing the 404 storm on start.
 *
 * Caches the result as a Set; a 404 (no index.json yet — e.g. a very old
 * deploy) caches an EMPTY set, which means "request nothing" and the plain
 * bank content is used. Never throws.
 *
 * @param {'translationSlugs'|'explanationSlugs'} key - state slot for the cache.
 * @param {string} url - e.g. /data/translations/index.json.
 * @returns {Promise<Set<string>>}
 */
async function loadOverlayIndex(key, url) {
  if (state[key] !== null) return state[key];
  let names = [];
  try {
    const res = await fetch(url, { mode: 'same-origin' });
    if (res.ok) names = (await res.json()) || [];
  } catch {
    names = []; // no index / offline → request nothing
  }
  state[key] = new Set(Array.isArray(names) ? names : []);
  return state[key];
}

/**
 * Explanations for one category (L9a). Served from /data/explanations/<slug>.json.
 * The first (or a renamed) category may have no file yet, so a 404 means
 * "none": we cache an empty object and the practice panel skips the block.
 * Never throws — explanations are an enhancement, not a load prerequisite.
 * The slug is requested only if listed in the explanations index (Q2).
 */
export async function loadExplanations(slug) {
  if (!state.explanationsBySlug.has(slug)) {
    let data = { items: {} };
    if ((await loadOverlayIndex('explanationSlugs', '/data/explanations/index.json')).has(`${slug}.json`)) {
      try {
        data = await api.explanations(slug);
      } catch {
        /* listed but still missing → treat as none */
      }
    }
    state.explanationsBySlug.set(slug, data);
  }
  return state.explanationsBySlug.get(slug);
}

export async function loadQuestions(slug) {
  if (!state.questionsBySlug.has(slug)) {
    // Phase 2.1: bank questions get the per-category translation overlay
    // (data/translations/<slug>.json) merged on top; a slug absent from the
    // translations index (Q2) is requested without the overlay file.
    const fetchLike = (url) => fetch(url, { mode: 'same-origin' });
    const listed = (await loadOverlayIndex('translationSlugs', '/data/translations/index.json')).has(`${slug}.json`);
    state.questionsBySlug.set(
      slug,
      await loadOverlays(slug, await api.questions(slug), fetchLike, listed),
    );
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
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
  } catch {
    return [];
  }
  // Entries written before exams were queued have no `kind`.
  return raw.map((entry) => (entry.kind ? entry : { kind: 'answer', ...entry }));
}

function writeQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function pendingCount() {
  return readQueue().length;
}

/** Mirrors the server's per-answer bookkeeping on the local snapshot. */
function applyLocalAnswers(batch) {
  const d = state.progress;
  for (const { id, correct } of batch) {
    const rec = d.answers[id] ?? { correct: 0, wrong: 0, lastCorrect: false, last: '', streak: 0, due: '' };
    if (correct) {
      rec.correct += 1;
      rec.streak = (Number.isInteger(rec.streak) ? rec.streak : 0) + 1;
      rec.due = addDays('', REVIEW_INTERVALS[Math.min(rec.streak - 1, REVIEW_INTERVALS.length - 1)]);
      d.mistakes = d.mistakes.filter((m) => m !== id);
    } else {
      rec.wrong += 1;
      rec.streak = 0;
      rec.due = addDays('', 1);
      if (!d.mistakes.includes(id)) d.mistakes.push(id);
    }
    rec.lastCorrect = correct;
    rec.last = new Date().toISOString();
    d.answers[id] = rec;
  }
  d.stats.answered = Object.keys(d.answers).length;
  d.stats.mastered = Object.values(d.answers).filter((a) => a.streak >= MASTERY_STREAK).length;
  d.stats.reviewDue = dueReviewCount(d.answers);
  d.stats.mistakes = d.mistakes.length;
}

/** Mirrors a finished mock exam onto the local snapshot. */
function applyLocalExam({ total, errors, passed }) {
  const d = state.progress;
  d.exams.push({ date: new Date().toISOString(), total, errors, passed });
  const taken = d.exams.length;
  const won = d.exams.filter((e) => e.passed).length;
  d.stats.examsTaken = taken;
  d.stats.examsPassed = won;
  d.stats.examSuccess = taken ? Math.round((won / taken) * 100) : 0;
}

/**
 * Replays the queue strictly in order, batching consecutive answers into
 * one request (the server caps a batch at 100) and sending exams on
 * their own. Returns true when the queue is fully drained.
 */
export async function flushQueue() {
  let queue = readQueue();
  while (queue.length) {
    const head = queue[0];
    let sent;
    if (head.kind === 'exam') {
      sent = 1;
      try {
        await api.recordExam({ total: head.total, errors: head.errors, passed: head.passed });
      } catch (err) {
        if (err.network) return false; // still offline — keep the queue
        // Validation failure: drop it rather than poison-pill the queue.
      }
    } else {
      const chunk = [];
      while (chunk.length < 100 && queue[chunk.length]?.kind === 'answer') {
        chunk.push(queue[chunk.length]);
      }
      sent = chunk.length;
      try {
        state.progress = await api.recordAnswers(
          chunk.map(({ id, correct }) => ({ id, correct })),
        );
      } catch (err) {
        if (err.network) return false;
      }
    }
    queue = queue.slice(sent);
    writeQueue(queue);
  }
  return true;
}

/**
 * Keeps retrying a stuck queue on its own. The `online` event is not
 * enough: when the local server dies the network itself stays up, so the
 * browser never fires it and the queue would sit there until the user
 * happens to answer something else.
 */
let retryTimer = null;
export const RETRY_MS = 20000;

export function scheduleQueueRetry(delayMs = RETRY_MS) {
  if (retryTimer || !readQueue().length) return;
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    if (!(await flushQueue())) scheduleQueueRetry(delayMs);
  }, delayMs);
}

/**
 * Records answers, falling back to the local queue when the server is
 * unreachable. Returns { synced } so callers can show an offline hint.
 */
export async function recordAnswersResilient(batch) {
  const entries = batch.map((a) => ({ kind: 'answer', ...a }));
  if (readQueue().length) {
    // Preserve order: append, mirror locally, then try to drain.
    writeQueue([...readQueue(), ...entries]);
    applyLocalAnswers(batch);
    const synced = await flushQueue();
    if (!synced) scheduleQueueRetry();
    return { synced };
  }
  try {
    state.progress = await api.recordAnswers(batch);
    return { synced: true };
  } catch (err) {
    if (!err.network) throw err;
    writeQueue([...readQueue(), ...entries]);
    applyLocalAnswers(batch);
    scheduleQueueRetry();
    return { synced: false };
  }
}

/**
 * Records a finished mock exam the same way. A 20-minute exam must never
 * be lost to a network blip, so it queues exactly like answers do.
 */
export async function recordExamResilient(exam) {
  const entry = { kind: 'exam', ...exam };
  if (readQueue().length) {
    writeQueue([...readQueue(), entry]);
    applyLocalExam(exam);
    const synced = await flushQueue();
    if (!synced) scheduleQueueRetry();
    return { synced };
  }
  try {
    await api.recordExam(exam);
    return { synced: true };
  } catch (err) {
    if (!err.network) throw err;
    writeQueue([...readQueue(), entry]);
    applyLocalExam(exam);
    scheduleQueueRetry();
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
