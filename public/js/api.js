import { localProgressApi } from './local-progress.js';

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      headers: options.body ? { 'Content-Type': 'application/json' } : {},
      ...options,
    });
  } catch (err) {
    err.network = true; // fetch itself failed: offline or server down
    throw err;
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `Request failed (${res.status})`);
  }
  return payload;
}

/**
 * The app runs in one of two modes:
 *
 *  - SERVER mode: the local Node app is behind it, progress is written to
 *    progress.json and shared by every browser on that machine.
 *  - STANDALONE mode: the app is served as static files (a phone opening
 *    the hosted PWA), so progress is kept in this browser.
 *
 * Static content comes from /data/* in both modes, so only the progress
 * half of the API differs.
 */
export const MODE = { server: 'server', standalone: 'standalone' };
let mode = null;

/**
 * Which mode are we in? The static build stamps a marker into index.html
 * (see scripts/build-static.js); the Node server serves public/index.html
 * untouched. Reading a meta tag keeps this deterministic and costs no
 * request — probing an endpoint would log a 404 on whichever host lacks it.
 */
export function detectMode() {
  if (!mode) {
    const marker = document.querySelector('meta[name="pp-mode"]')?.content;
    mode = marker === MODE.standalone ? MODE.standalone : MODE.server;
  }
  return mode;
}

export function currentMode() {
  return mode;
}

/** Static study content: identical URLs whether hosted or served locally. */
const staticApi = {
  manifest: () => request('/data/manifest.json'),
  theory: () => request('/data/theory.json'),
  dictionary: () => request('/data/dictionary.json'),
  lessons: () => request('/data/lessons.json'),
  insights: () => request('/data/insights/signal-words.json'),
  questions: (slug) => request(`/data/questions/${slug}.json`),
};

const serverProgressApi = {
  progress: () => request('/api/progress'),
  updateProfile: (profile) =>
    request('/api/progress/profile', { method: 'PUT', body: JSON.stringify(profile) }),
  recordAnswers: (answers) =>
    request('/api/progress/answers', { method: 'POST', body: JSON.stringify({ answers }) }),
  recordExam: (exam) =>
    request('/api/progress/exams', { method: 'POST', body: JSON.stringify(exam) }),
  markTheoryRead: (chapterId) =>
    request('/api/progress/theory', { method: 'POST', body: JSON.stringify({ chapterId }) }),
  importProgress: (data) =>
    request('/api/progress/import', { method: 'POST', body: JSON.stringify(data) }),
  resetProgress: () => request('/api/progress', { method: 'DELETE' }),
};

function progressApi() {
  return mode === MODE.standalone ? localProgressApi : serverProgressApi;
}

export const api = {
  ...staticApi,
  progress: (...a) => progressApi().progress(...a),
  updateProfile: (...a) => progressApi().updateProfile(...a),
  recordAnswers: (...a) => progressApi().recordAnswers(...a),
  recordExam: (...a) => progressApi().recordExam(...a),
  markTheoryRead: (...a) => progressApi().markTheoryRead(...a),
  importProgress: (...a) => progressApi().importProgress(...a),
  resetProgress: (...a) => progressApi().resetProgress(...a),
};
