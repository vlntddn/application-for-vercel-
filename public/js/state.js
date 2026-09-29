import { api, detectMode } from './api.js';
import { loadOverlays } from './domain/translations.js';

/** Shared app state: progress snapshot plus cached static data. */
export const state = {
  progress: null, // snapshot from /api/progress (includes stats)
  manifest: null,
  theory: null,
  dictionary: null,
  lessons: null,
  insights: null,
  numbers: null,
  questionsBySlug: new Map(),
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
  if (!state.lessons) state.lessons = await api.lessons();
  return state.lessons;
}

export async function loadInsights() {
  if (!state.insights) state.insights = await api.insights();
  return state.insights;
}

export async function loadNumbers() {
  if (!state.numbers) state.numbers = await api.numbers();
  return state.numbers;
}

export async function loadQuestions(slug) {
  if (!state.questionsBySlug.has(slug)) {
    // Phase 2.1: bank questions get the per-category translation overlay
    // (data/translations/<slug>.json) merged on top; missing overlay → bank.
    state.questionsBySlug.set(
      slug,
      await loadOverlays(slug, await api.questions(slug), (url) => fetch(url, { mode: 'same-origin' })),
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
