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

test('daily goal defaults to 20 and only accepts an integer in range', async () => {
  const { service, store } = makeService();
  assert.equal(store.data.profile.dailyGoal, 20);
  const profile = await service.updateProfile({ dailyGoal: 50 });
  assert.equal(profile.dailyGoal, 50);
  for (const bad of [4, 201, '50', 20.5, 0, null, true, {}]) {
    await assert.rejects(() => service.updateProfile({ dailyGoal: bad }), ValidationError);
  }
  assert.equal((await service.updateProfile({ dailyGoal: 5 })).dailyGoal, 5, 'the lower bound is allowed');
  assert.equal((await service.updateProfile({ dailyGoal: 200 })).dailyGoal, 200, 'the upper bound is allowed');
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

  // Simulate that the last activity was yesterday. The domain files days
  // under the local calendar date (not UTC), so "yesterday" must be local too.
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  store.data.streak.lastDay =
    `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
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

test('import replaces progress and validates every field', async () => {
  const { service } = makeService();
  await service.recordAnswers({ answers: [{ id: 'old-question-1', correct: true }] });

  const snap = await service.importProgress({
    profile: { name: '  Marco  ', language: 'zh', theme: 'dark', sound: false, onboarded: true },
    answers: {
      'sorpasso-a-1': { correct: 2, wrong: 1, lastCorrect: true, last: '2026-01-01T00:00:00.000Z' },
      'sorpasso-a-2': { correct: 0, wrong: 3, lastCorrect: false, last: '2026-01-02T00:00:00.000Z' },
    },
    mistakes: ['sorpasso-a-2'],
    exams: [{ date: '2026-01-03T00:00:00.000Z', total: 30, errors: 1, passed: true }],
    theoryRead: ['ch1', 'ch2'],
    streak: { current: 5, lastDay: '2026-01-03' },
    somethingUnknown: 'dropped',
  });

  assert.equal(snap.profile.name, 'Marco');
  assert.equal(snap.profile.language, 'zh');
  assert.equal(snap.profile.sound, false);
  // The pre-import answer is gone: import replaces, never merges.
  assert.deepEqual(Object.keys(snap.answers).sort(), ['sorpasso-a-1', 'sorpasso-a-2']);
  assert.deepEqual(snap.mistakes, ['sorpasso-a-2']);
  assert.equal(snap.exams.length, 1);
  assert.deepEqual(snap.theoryRead, ['ch1', 'ch2']);
  assert.equal(snap.streak.current, 5);
  assert.equal(snap.stats.mastered, 1);
  assert.equal(snap.stats.answered, 2);
  assert.equal(snap.somethingUnknown, undefined);
});

test('import rejects malformed backups', async () => {
  const { service } = makeService();
  const bad = [
    { profile: { language: 'it' } },
    { profile: { sound: 'yes' } },
    { answers: { 'q-1': { correct: -1, wrong: 0, lastCorrect: true } } },
    { answers: { 'q-1': { correct: 1, wrong: 0, lastCorrect: 'maybe' } } },
    { exams: [{ total: 30, errors: 40 }] },
    { exams: 'nope' },
    { mistakes: [42] },
    { streak: { current: -2 } },
    [],
  ];
  for (const payload of bad) {
    await assert.rejects(() => service.importProgress(payload), ValidationError,
      `should reject ${JSON.stringify(payload)}`);
  }
});

test('import keeps mistakes consistent with answers', async () => {
  const { service } = makeService();
  const snap = await service.importProgress({
    answers: { 'q-right': { correct: 1, wrong: 0, lastCorrect: true } },
    // one refers to a mastered question, one to a question that is absent
    mistakes: ['q-right', 'q-missing'],
  });
  assert.deepEqual(snap.mistakes, []);
  assert.equal(snap.stats.mistakes, 0);
});

test('an exported snapshot can be imported back unchanged', async () => {
  const { service } = makeService();
  await service.updateProfile({ name: 'Anna', language: 'ru', onboarded: true });
  await service.recordAnswers({ answers: [{ id: 'sorpasso-x-1', correct: false }] });
  await service.recordExam({ total: 30, errors: 2 });

  const exported = JSON.parse(JSON.stringify(service.snapshot()));
  delete exported.stats;
  const reimported = await service.importProgress(exported);

  assert.equal(reimported.profile.name, 'Anna');
  assert.deepEqual(reimported.mistakes, ['sorpasso-x-1']);
  assert.equal(reimported.exams.length, 1);
  assert.equal(reimported.stats.mistakes, 1);
});

test('active days are recorded per local calendar day, capped at 90', async () => {
  const { service, store } = makeService();
  await service.recordAnswers({ answers: [{ id: 'q-1', correct: true }] });
  await service.recordAnswers({ answers: [{ id: 'q-2', correct: false }] });

  const now = new Date();
  const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // One entry per day, not per answer, and the LOCAL date — a session at
  // 23:30 in Rome must not be filed under tomorrow the way UTC would.
  assert.deepEqual(store.data.activeDays, [todayLocal]);

  store.data.activeDays = Array.from({ length: 95 }, (_, i) => `2020-01-${String((i % 28) + 1).padStart(2, '0')}`);
  store.data.streak.lastDay = '';
  await service.recordAnswers({ answers: [{ id: 'q-3', correct: true }] });
  assert.ok(store.data.activeDays.length <= 90, 'active days must stay capped');
  assert.ok(store.data.activeDays.includes(todayLocal));
});

test('the streak survives a daylight-saving change', async () => {
  const { service, store } = makeService();
  // Italy moves the clock on the last Sunday of October; subtracting a raw
  // 24h across that boundary lands on the same calendar day and would break
  // the "was I here yesterday?" comparison.
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  store.data.streak = { current: 4, lastDay: key(yesterday) };
  await service.recordAnswers({ answers: [{ id: 'q-1', correct: true }] });
  assert.equal(store.data.streak.current, 5, 'a session the next day continues the streak');
});

test('daily answer counts drive the dashboard goal and stay capped', async () => {
  const { service, store } = makeService();
  await service.recordAnswers({ answers: [{ id: 'a', correct: true }, { id: 'b', correct: false }] });
  await service.recordAnswers({ answers: [{ id: 'c', correct: true }] });

  const days = Object.keys(store.data.dailyAnswers);
  assert.equal(days.length, 1);
  assert.equal(store.data.dailyAnswers[days[0]], 3, 'every answer counts, including repeats');

  for (let i = 0; i < 95; i++) store.data.dailyAnswers[`2020-02-${String((i % 28) + 1).padStart(2, '0')}-${i}`] = 1;
  await service.recordAnswers({ answers: [{ id: 'd', correct: true }] });
  assert.ok(Object.keys(store.data.dailyAnswers).length <= 90);
});

test('import validates the new activity fields', async () => {
  const { service } = makeService();
  const snap = await service.importProgress({
    activeDays: ['2026-08-21', 'not-a-date', '2026-08-21', '2026-08-20'],
    dailyAnswers: { '2026-08-20': 14, 'rubbish': 3 },
  });
  assert.deepEqual(snap.activeDays, ['2026-08-20', '2026-08-21'], 'deduped, sorted, junk dropped');
  assert.deepEqual(snap.dailyAnswers, { '2026-08-20': 14 });

  await assert.rejects(() => service.importProgress({ activeDays: 'nope' }), ValidationError);
  await assert.rejects(
    () => service.importProgress({ dailyAnswers: { '2026-08-20': -3 } }), ValidationError,
  );
});

test('a snapshot from an older version opens with everything intact', async () => {
  const { migrateProgress, SCHEMA_VERSION } = await import('../public/js/domain/progress.js');

  // Exactly what an earlier release wrote: no version, sound, activeDays
  // or dailyAnswers, because those fields did not exist yet.
  const legacy = {
    profile: { name: 'Valentin', language: 'ru', theme: 'dark', onboarded: true },
    answers: {
      'sorpasso-q-1': { correct: 3, wrong: 1, lastCorrect: true, last: '2026-08-20T09:00:00.000Z' },
      'sorpasso-q-2': { correct: 0, wrong: 2, lastCorrect: false, last: '2026-08-21T09:00:00.000Z' },
    },
    mistakes: ['sorpasso-q-2'],
    exams: [{ date: '2026-08-20T10:00:00.000Z', total: 30, errors: 2, passed: true }],
    theoryRead: ['ch1', 'ch2'],
    streak: { current: 6, lastDay: '2026-08-27' },
  };

  const m = migrateProgress(legacy);
  assert.equal(m.profile.name, 'Valentin');
  assert.equal(m.profile.language, 'ru');
  assert.equal(m.profile.sound, true, 'a field added later gets its default');
  assert.equal(m.profile.dailyGoal, 20, 'the goal field added later gets its default');
  assert.equal(Object.keys(m.answers).length, 2);
  assert.deepEqual(m.mistakes, ['sorpasso-q-2']);
  assert.equal(m.exams.length, 1);
  assert.deepEqual(m.theoryRead, ['ch1', 'ch2']);
  assert.equal(m.streak.current, 6);
  assert.equal(m.version, SCHEMA_VERSION);
  // The week strip can still light up: the last active day is known.
  assert.deepEqual(m.activeDays, ['2026-08-27']);
});

test('migration repairs damage instead of discarding a history', async () => {
  const { migrateProgress } = await import('../public/js/domain/progress.js');

  const messy = {
    profile: { name: 'Anna', language: 'klingon', theme: 42, onboarded: true },
    answers: {
      good: { correct: 2, wrong: 0, lastCorrect: true },
      broken: 'not an object',
      negative: { correct: -5, wrong: -1, lastCorrect: true },
      __proto__: { correct: 1, wrong: 0, lastCorrect: true, pwned: true },
    },
    mistakes: ['good', 12345],
    exams: [{ total: 30, errors: 2 }, 'rubbish', { total: 0, errors: 0 }],
    streak: { current: -4, lastDay: 'whenever' },
    activeDays: ['2026-08-01', 'nope'],
    dailyAnswers: { '2026-08-01': 9, bad: 3 },
  };

  const m = migrateProgress(messy);
  assert.equal(m.profile.name, 'Anna', 'valid fields are kept');
  assert.equal(m.profile.language, 'en', 'invalid enum falls back to the default');
  assert.equal(m.profile.theme, 'light');
  assert.ok(m.answers.good, 'the good answer survives the bad neighbours');
  assert.equal(m.answers.broken, undefined);
  assert.equal(m.answers.negative.correct, 0, 'negative counters are clamped');
  assert.equal({}.pwned, undefined, 'no prototype pollution through a stored key');
  assert.deepEqual(m.mistakes, [], 'a mistake whose answer is now correct is dropped');
  assert.equal(m.exams.length, 1, 'only the well-formed exam is kept');
  assert.equal(m.streak.current, 0);
  assert.deepEqual(m.activeDays, ['2026-08-01']);
  assert.deepEqual(m.dailyAnswers, { '2026-08-01': 9 });

  // Nothing at all must still produce a usable, empty profile.
  for (const junk of [null, undefined, 'string', 42, []]) {
    assert.equal(migrateProgress(junk).profile.onboarded, false);
  }
});

test('daily goal migrates leniently and imports strictly', async () => {
  const { migrateProgress } = await import('../public/js/domain/progress.js');
  assert.equal(migrateProgress({ profile: {} }).profile.dailyGoal, 20, 'missing field gets the default');
  assert.equal(migrateProgress({ profile: { dailyGoal: 30 } }).profile.dailyGoal, 30, 'a saved goal is kept');
  assert.equal(migrateProgress({ profile: { dailyGoal: '30' } }).profile.dailyGoal, 30, 'a string number is repaired');
  assert.equal(migrateProgress({ profile: { dailyGoal: 999 } }).profile.dailyGoal, 20, 'out of range falls back');

  const { service } = makeService();
  const snap = await service.importProgress({ profile: { dailyGoal: 35 } });
  assert.equal(snap.profile.dailyGoal, 35, 'a backup goal is accepted when valid');
  await assert.rejects(() => service.importProgress({ profile: { dailyGoal: 0 } }), ValidationError);
  await assert.rejects(() => service.importProgress({ profile: { dailyGoal: 'a lot' } }), ValidationError);
});

test('a progress file written by an older version still loads', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patente-old-'));
  const file = path.join(dir, 'progress.json');
  fs.writeFileSync(file, JSON.stringify({
    profile: { name: 'Marco', language: 'zh', onboarded: true },
    answers: { 'q-1': { correct: 1, wrong: 0, lastCorrect: true } },
    mistakes: [], exams: [], theoryRead: [], streak: { current: 3, lastDay: '2026-08-27' },
  }));

  const store = new JsonStore(file, EMPTY_PROGRESS).load();
  const snap = new ProgressService(store).snapshot();
  assert.equal(snap.profile.name, 'Marco');
  assert.equal(snap.profile.sound, true, 'new field defaulted, not left undefined');
  assert.equal(snap.stats.mastered, 1);
  assert.equal(snap.streak.current, 3);
});
