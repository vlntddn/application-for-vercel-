import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Standalone mode runs the shared domain module against localStorage.
 * These tests drive it exactly as a phone would, with a minimal storage
 * shim, to prove the hosted build enforces the same rules as the server
 * and that a saved snapshot survives a "reload".
 */

function installLocalStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  return map;
}

/** Fresh module instance per test: the store is created at import time. */
async function loadLocalApi(seed) {
  installLocalStorage(seed);
  const mod = await import(`../public/js/local-progress.js?t=${Math.random()}`);
  return mod.localProgressApi;
}

test('standalone records answers and derives the same stats', async () => {
  const api = await loadLocalApi();
  await api.updateProfile({ name: 'Valentin', language: 'ru', onboarded: true });

  let snap = await api.recordAnswers([{ id: 'sorpasso-q-1', correct: false }]);
  assert.deepEqual(snap.mistakes, ['sorpasso-q-1']);
  assert.equal(snap.stats.mastered, 0);

  snap = await api.recordAnswers([{ id: 'sorpasso-q-1', correct: true }]);
  assert.deepEqual(snap.mistakes, []);
  assert.equal(snap.stats.mastered, 1);
  assert.equal(snap.stats.streak, 1);
});

test('standalone enforces the very same validation as the server', async () => {
  const api = await loadLocalApi();
  await assert.rejects(() => api.updateProfile({ language: 'it' }), /language/);
  await assert.rejects(() => api.recordAnswers([{ id: 'q', correct: 'yes' }]), /correct/);
  await assert.rejects(() => api.recordExam({ total: 30, errors: 40 }), /errors/);
  await assert.rejects(() => api.importProgress({ streak: { current: -1 } }), /streak/);
});

test('progress written by a phone is read back after a reload', async () => {
  const store = installLocalStorage();
  const first = (await import('../public/js/local-progress.js?reload=1')).localProgressApi;
  await first.updateProfile({ name: 'Anna', onboarded: true });
  await first.recordAnswers([{ id: 'segnali-pericolo-q-9', correct: true }]);
  await first.recordExam({ total: 30, errors: 1 });

  // Same browser storage, module loaded again — as after closing the app.
  const saved = Object.fromEntries(store);
  const second = (await loadLocalApi(saved));
  const snap = await second.progress();
  assert.equal(snap.profile.name, 'Anna');
  assert.equal(snap.profile.onboarded, true);
  assert.equal(snap.stats.answered, 1);
  assert.equal(snap.stats.examsTaken, 1);
  assert.equal(snap.stats.examsPassed, 1);
});

test('derived stats are never persisted, only recomputed', async () => {
  const store = installLocalStorage();
  const api = (await import('../public/js/local-progress.js?nostats=1')).localProgressApi;
  await api.recordAnswers([{ id: 'q-1', correct: true }]);
  const raw = JSON.parse(store.get('pp-progress'));
  assert.equal(raw.stats, undefined);
  assert.equal((await api.progress()).stats.answered, 1);
});

test('a corrupt or half-written snapshot falls back to an empty profile', async () => {
  const api = await loadLocalApi({ 'pp-progress': '{ not json' });
  const snap = await api.progress();
  assert.deepEqual(snap.answers, {});
  assert.equal(snap.profile.onboarded, false);

  // A snapshot from an older version keeps working: missing keys are filled.
  const older = await loadLocalApi({
    'pp-progress': JSON.stringify({ profile: { name: 'Old' }, answers: {} }),
  });
  const oldSnap = await older.progress();
  assert.equal(oldSnap.profile.name, 'Old');
  assert.equal(oldSnap.profile.language, 'en');
  assert.deepEqual(oldSnap.exams, []);
});

test('standalone import restores a backup exported anywhere', async () => {
  const api = await loadLocalApi();
  const snap = await api.importProgress({
    profile: { name: 'Marco', language: 'zh', onboarded: true },
    answers: { 'sorpasso-a-1': { correct: 1, wrong: 0, lastCorrect: true } },
    exams: [{ date: '2026-01-01T00:00:00.000Z', total: 30, errors: 0, passed: true }],
    theoryRead: ['ch1'],
  });
  assert.equal(snap.profile.name, 'Marco');
  assert.equal(snap.stats.mastered, 1);
  assert.equal(snap.stats.examsPassed, 1);
});
