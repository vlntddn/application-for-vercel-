import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { JsonStore } from '../server/store.js';
import { ProgressService, ValidationError, EMPTY_PROGRESS } from '../server/progress.js';

function makeService() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patente-'));
  const store = new JsonStore(path.join(dir, 'progress.json'), EMPTY_PROGRESS).load();
  return { store, service: new ProgressService(store) };
}

test('profile updates validate name, language and theme', async () => {
  const { service } = makeService();
  const profile = await service.updateProfile({ name: '  Anna  ', language: 'ru', theme: 'dark', onboarded: true });
  assert.equal(profile.name, 'Anna');
  assert.equal(profile.language, 'ru');

  await assert.rejects(() => service.updateProfile({ language: 'it' }), ValidationError);
  await assert.rejects(() => service.updateProfile({ theme: 'neon' }), ValidationError);
  await assert.rejects(() => service.updateProfile({ name: 'x'.repeat(41) }), ValidationError);
});

test('profile sound flag defaults on and validates as boolean', async () => {
  const { service, store } = makeService();
  assert.equal(store.data.profile.sound, true);
  const profile = await service.updateProfile({ sound: false });
  assert.equal(profile.sound, false);
  await assert.rejects(() => service.updateProfile({ sound: 'loud' }), ValidationError);
});

test('answers update counters, mistakes and stats', async () => {
  const { service } = makeService();
  let snap = await service.recordAnswers({ answers: [{ id: 'sorpasso-q-1', correct: false }] });
  assert.deepEqual(snap.mistakes, ['sorpasso-q-1']);
  assert.equal(snap.stats.mastered, 0);

  snap = await service.recordAnswers({ answers: [{ id: 'sorpasso-q-1', correct: true }] });
  assert.deepEqual(snap.mistakes, []);
  assert.equal(snap.stats.mastered, 1);
  assert.equal(snap.answers['sorpasso-q-1'].correct, 1);
  assert.equal(snap.answers['sorpasso-q-1'].wrong, 1);
});

test('answer batches are validated', async () => {
  const { service } = makeService();
  await assert.rejects(() => service.recordAnswers({}), ValidationError);
  await assert.rejects(() => service.recordAnswers({ answers: [] }), ValidationError);
  await assert.rejects(() => service.recordAnswers({ answers: [{ id: '', correct: true }] }), ValidationError);
  await assert.rejects(() => service.recordAnswers({ answers: [{ id: 'a', correct: 'yes' }] }), ValidationError);
  const tooMany = Array.from({ length: 101 }, (_, i) => ({ id: `q-${i}`, correct: true }));
  await assert.rejects(() => service.recordAnswers({ answers: tooMany }), ValidationError);
});

test('exams are recorded with pass/fail and reflected in stats', async () => {
  const { service } = makeService();
  const exam = await service.recordExam({ total: 30, errors: 2 });
  assert.equal(exam.passed, true);
  await service.recordExam({ total: 30, errors: 7 });
  const snap = service.snapshot();
  assert.equal(snap.stats.examsTaken, 2);
  assert.equal(snap.stats.examsPassed, 1);
  assert.equal(snap.stats.examSuccess, 50);

  await assert.rejects(() => service.recordExam({ total: 0, errors: 0 }), ValidationError);
  await assert.rejects(() => service.recordExam({ total: 30, errors: 31 }), ValidationError);
});

test('streak increments once per day', async () => {
  const { service, store } = makeService();
  await service.recordAnswers({ answers: [{ id: 'a-1', correct: true }] });
  await service.recordAnswers({ answers: [{ id: 'a-2', correct: true }] });
  assert.equal(store.data.streak.current, 1);

  // Simulate that the last activity was yesterday.
  store.data.streak.lastDay = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await service.recordAnswers({ answers: [{ id: 'a-3', correct: true }] });
  assert.equal(store.data.streak.current, 2);

  // A gap of more than one day resets the streak.
  store.data.streak.lastDay = '2000-01-01';
  await service.recordAnswers({ answers: [{ id: 'a-4', correct: true }] });
  assert.equal(store.data.streak.current, 1);
});

test('reset returns to the empty state and persists', async () => {
  const { service, store } = makeService();
  await service.recordAnswers({ answers: [{ id: 'a-1', correct: false }] });
  await service.reset();
  await store.flush();

  const reloaded = new JsonStore(store.file, EMPTY_PROGRESS).load();
  assert.deepEqual(reloaded.data.answers, {});
  assert.deepEqual(reloaded.data.mistakes, []);
});

test('a corrupt progress file is quarantined instead of crashing', async () => {
  const { store } = makeService();
  await store.persist();
  fs.writeFileSync(store.file, '{ not json');

  const reloaded = new JsonStore(store.file, EMPTY_PROGRESS).load();
  assert.deepEqual(reloaded.data.answers, {});
  const backups = fs.readdirSync(path.dirname(store.file)).filter((f) => f.includes('.corrupt.'));
  assert.equal(backups.length, 1);
});
