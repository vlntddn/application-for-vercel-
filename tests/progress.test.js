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
  const { service, store } = makeService();
  // S3.3: a brand-new profile starts on the 'auto' theme.
  assert.equal(store.data.profile.theme, 'auto', 'new profile defaults to auto');

  const profile = await service.updateProfile({ name: '  Anna  ', language: 'ru', theme: 'dark', onboarded: true });
  assert.equal(profile.name, 'Anna');
  assert.equal(profile.language, 'ru');

  const autoProfile = await service.updateProfile({ theme: 'auto' });
  assert.equal(autoProfile.theme, 'auto', 'auto is accepted');

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

test('signal hints default to auto and only accept the three modes', async () => {
  const { service, store } = makeService();
  assert.equal(store.data.profile.signalHints, 'auto');
  const profile = await service.updateProfile({ signalHints: 'off' });
  assert.equal(profile.signalHints, 'off');
  await assert.rejects(() => service.updateProfile({ signalHints: 'sometimes' }), ValidationError);
  await assert.rejects(() => service.updateProfile({ signalHints: null }), ValidationError);
});

test('answers update counters, mistakes and stats', async () => {
  const { service } = makeService();
  let snap = await service.recordAnswers({ answers: [{ id: 'sorpasso-q-1', correct: false }] });
  assert.deepEqual(snap.mistakes, ['sorpasso-q-1']);
  assert.equal(snap.stats.mastered, 0);

  snap = await service.recordAnswers({ answers: [{ id: 'sorpasso-q-1', correct: true }] });
  assert.deepEqual(snap.mistakes, []);
  // L6a: one correct answer is a streak of 1 — "mastered" needs two in a row.
  assert.equal(snap.stats.mastered, 0);
  assert.equal(snap.answers['sorpasso-q-1'].streak, 1);

  snap = await service.recordAnswers({ answers: [{ id: 'sorpasso-q-1', correct: true }] });
  assert.equal(snap.stats.mastered, 1);
  assert.equal(snap.answers['sorpasso-q-1'].correct, 2);
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
      'sorpasso-a-1': { correct: 2, wrong: 1, lastCorrect: true, last: '2026-01-01T00:00:00.000Z', streak: 3 },
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
  // L6a: mastered now means streak >= 2; the imported record says streak 3.
  assert.equal(snap.stats.mastered, 1);
  assert.equal(snap.answers['sorpasso-a-1'].streak, 3);
  assert.equal(snap.answers['sorpasso-a-2'].streak, 0);
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
    { answers: { 'q-1': { correct: 1, wrong: 0, lastCorrect: true, streak: -1 } } },
    { answers: { 'q-1': { correct: 1, wrong: 0, lastCorrect: true, streak: 1.5 } } },
    { answers: { 'q-1': { correct: 1, wrong: 0, lastCorrect: true, due: 'next week' } } },
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

test('streak shield: goal earns a shield, one skipped day is forgiven (S3.7a)', async () => {
  const { streakShieldState, goalReachedOn } = await import('../public/js/domain/progress.js');
  const localDay = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // 1. Hitting the daily goal earns the shield.
  assert.deepEqual(goalReachedOn({ '2026-01-15': 20 }, '2026-01-15', 20), true, 'exactly the goal counts');
  assert.equal(goalReachedOn({ '2026-01-15': 19 }, '2026-01-15', 20), false, 'one short is no shield');
  assert.equal(goalReachedOn({}, '2026-01-15', 20), false, 'no answers that day');

  // 2. Skipped exactly one day with a shield: streak continues, shield spent.
  const spared = streakShieldState(
    { current: 5, lastDay: localDay(-2), shields: 1 }, localDay(0), { [localDay(-2)]: 20 }, 20,
  );
  assert.equal(spared.current, 5, 'streak survives the gap');
  assert.equal(spared.shields, 0, 'the shield is spent');
  assert.equal(spared.lastDay, localDay(0), 'lastDay moves to the return day');

  // 3. Same gap without a shield: streak resets.
  const reset = streakShieldState(
    { current: 5, lastDay: localDay(-2), shields: 0 }, localDay(0), {}, 20,
  );
  assert.equal(reset.current, 1, 'no shield — the streak restarts');
  assert.equal(reset.shields, 0);
  assert.equal(reset.lastDay, localDay(0), 'a reset streak starts today');

  // 4. A gap of two days: the shield does not reach that far.
  const farGap = streakShieldState(
    { current: 5, lastDay: localDay(-3), shields: 1 }, localDay(0), { [localDay(-3)]: 20 }, 20,
  );
  assert.equal(farGap.current, 1, 'two missed days beat the shield');
  assert.equal(farGap.shields, 0, 'an unused shield is lost with the streak');
  assert.equal(farGap.lastDay, localDay(0), 'the restarted streak starts today');

  // 5. A normal (gap-less) day increments the streak and clears any old shield.
  const normal = streakShieldState(
    { current: 4, lastDay: localDay(-1), shields: 1 }, localDay(0), { [localDay(0)]: 20 }, 20,
  );
  assert.equal(normal.current, 5, 'a gap-less day just continues');
  assert.equal(normal.shields, 1, 'today\'s goal earned a fresh shield');
  assert.equal(streakShieldState({ current: 4, lastDay: localDay(-1), shields: 1 }, localDay(0), {}, 20).shields, 1, 'no goal — the unspent shield is kept');

  // 6. Reaching the goal on the activity day earns a shield even though the
  //    streak itself keeps counting; a day off is then forgiven end-to-end.
  const { service, store } = makeService();
  for (let i = 0; i < 20; i++) {
    await service.recordAnswers({ answers: [{ id: `g-${i}`, correct: i % 2 === 0 }] });
  }
  assert.equal(store.data.streak.shields, 1, 'today\'s goal is met');
  store.data.streak.lastDay = localDay(-2);
  store.data.streak.current = 5;
  delete store.data.dailyAnswers[localDay(0)];
  await service.recordAnswers({ answers: [{ id: 'back', correct: true }] });
  assert.equal(store.data.streak.current, 5, 'e2e: the skipped day cost nothing');
  assert.equal(store.data.streak.shields, 0);
  assert.equal(store.data.streak.lastDay, localDay(0), 'e2e: lastDay is the return day');

  // 7. S3.7b: the snapshot exposes the unspent shield for the dashboard.
  store.data.streak.shields = 1;
  assert.equal(service.snapshot().stats.shield, 1, 'an unspent shield shows in stats');
  store.data.streak.shields = 0;
  assert.equal(service.snapshot().stats.shield, 0, 'no shield — stats.shield is 0');
});

test('streak shield: old snapshots default to 0, import validates 0..1 (S3.7a)', async () => {
  const { migrateProgress } = await import('../public/js/domain/progress.js');
  assert.equal(migrateProgress({ streak: { current: 6, lastDay: '2026-08-27' } }).streak.shields, 0, 'a pre-shield file opens with no shield');
  assert.equal(migrateProgress({ streak: { current: 6, lastDay: '2026-08-27', shields: 1 } }).streak.shields, 1, 'a saved shield is kept');

  const { service } = makeService();
  assert.equal((await service.importProgress({ streak: { current: 3, lastDay: '2026-09-30', shields: 1 } })).streak.shields, 1);
  for (const junk of [2, -1, '1', 0.5]) {
    await assert.rejects(
      () => service.importProgress({ streak: { current: 3, lastDay: '2026-09-30', shields: junk } }),
      ValidationError, `shields=${JSON.stringify(junk)}`,
    );
  }
});

test('streak best: longest streak is kept across resets and days (S3.9a)', async () => {
  const { streakShieldState, migrateProgress } = await import('../public/js/domain/progress.js');
  const localDay = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // 1. A gap-less day raises best to the new current.
  assert.equal(
    streakShieldState({ current: 4, lastDay: localDay(-1), shields: 0, best: 4 }, localDay(0), {}, 20).best, 5,
    'continuing updates best',
  );

  // 2. A reset does not lower best.
  const reset = streakShieldState(
    { current: 5, lastDay: localDay(-2), shields: 0, best: 5 }, localDay(0), {}, 20,
  );
  assert.equal(reset.current, 1, 'reset back to 1');
  assert.equal(reset.best, 5, 'best survives the reset');

  // 3. The shield branch (current unchanged) must not lower best either.
  assert.equal(
    streakShieldState({ current: 5, lastDay: localDay(-2), shields: 1, best: 5 }, localDay(0), {}, 20).best, 5,
    'a spared day keeps best',
  );

  // 4. End-to-end: two study days build a streak of 2, a reset keeps best = 2.
  const { service, store } = makeService();
  await service.recordAnswers({ answers: [{ id: 'd1', correct: true }] });
  assert.equal(store.data.streak.best, 1, 'first day: best is 1');
  store.data.streak.lastDay = localDay(-1);
  store.data.streak.current = 1;
  store.data.streak.best = 1;
  delete store.data.dailyAnswers[localDay(0)];
  await service.recordAnswers({ answers: [{ id: 'd2', correct: true }] });
  assert.equal(store.data.streak.current, 2, 'second day: streak is 2');
  assert.equal(store.data.streak.best, 2, 'best follows the streak');
  store.data.streak.lastDay = localDay(-3);
  delete store.data.dailyAnswers[localDay(0)];
  await service.recordAnswers({ answers: [{ id: 'd3', correct: true }] });
  assert.equal(store.data.streak.current, 1, 'gap: streak reset');
  assert.equal(store.data.streak.best, 2, 'gap: best untouched');

  // 5. The snapshot exposes the record for the «Рекорды» screen.
  assert.equal(service.snapshot().stats.streakBest, 2, 'stats.streakBest mirrors streak.best');

  // 6. Migration and import: a pre-S3.9a snapshot starts at 0; a saved
  //    record is kept; junk best rejects the backup.
  assert.equal(migrateProgress({ streak: { current: 6, lastDay: '2026-08-27' } }).streak.best, 0, 'pre-best file opens at 0');
  assert.equal(migrateProgress({ streak: { current: 6, lastDay: '2026-08-27', best: 9 } }).streak.best, 9, 'a saved best is kept');
  assert.equal((await service.importProgress({ streak: { current: 3, lastDay: '2026-09-30', best: 7 } })).streak.best, 7);
  for (const junk of [-1, '7', 1.5]) {
    await assert.rejects(
      () => service.importProgress({ streak: { current: 3, lastDay: '2026-09-30', best: junk } }),
      ValidationError, `best=${JSON.stringify(junk)}`,
    );
  }
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
  assert.equal(m.profile.signalHints, 'auto', 'the hints field added later gets its default');
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
  assert.equal(migrateProgress({ profile: {} }).profile.signalHints, 'auto', 'missing hints default');
  assert.equal(migrateProgress({ profile: { signalHints: 'off' } }).profile.signalHints, 'off', 'a saved mode is kept');
  assert.equal(migrateProgress({ profile: { signalHints: 'sometimes' } }).profile.signalHints, 'auto', 'an unknown mode falls back');

  const { service } = makeService();
  const snap = await service.importProgress({ profile: { dailyGoal: 35 } });
  assert.equal(snap.profile.dailyGoal, 35, 'a backup goal is accepted when valid');
  await assert.rejects(() => service.importProgress({ profile: { dailyGoal: 0 } }), ValidationError);
  await assert.rejects(() => service.importProgress({ profile: { dailyGoal: 'a lot' } }), ValidationError);
  assert.equal((await service.importProgress({ profile: { signalHints: 'on' } })).profile.signalHints, 'on');
  await assert.rejects(() => service.importProgress({ profile: { signalHints: 'always' } }), ValidationError);
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
  // L6a: a pre-streak record derives streak 1 from lastCorrect — not yet mastered.
  assert.equal(snap.stats.mastered, 0);
  assert.equal(snap.answers['q-1'].streak, 1);
  assert.ok(snap.answers['q-1'].due, 'the derived due date exists');
  assert.equal(snap.streak.current, 3);
});


test('recordChapterCheck keeps the best score and accepts 0-5', async () => {
  const { service, store } = makeService();
  // A perfect 5/5 is the quiz's max and must be accepted (PATH_CHECK_QUESTIONS = 5).
  const first = await service.recordChapterCheck({ chapterId: 'ch1', correct: 5 });
  assert.equal(first.chapters.ch1.check, 5);
  // A later worse score must not lower the kept best.
  const second = await service.recordChapterCheck({ chapterId: 'ch1', correct: 2 });
  assert.equal(second.chapters.ch1.check, 5);
  assert.equal(store.data.chapters.ch1.check, 5);
  // Out-of-range and non-integer scores are rejected.
  await assert.rejects(() => service.recordChapterCheck({ chapterId: 'ch1', correct: 6 }), ValidationError);
  await assert.rejects(() => service.recordChapterCheck({ chapterId: 'ch1', correct: -1 }), ValidationError);
  await assert.rejects(() => service.recordChapterCheck({ chapterId: 'ch1', correct: 2.5 }), ValidationError);
});

/* ---------------- L6a — spaced repetition (streak / due) ---------------- */

const isoDay = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOffset = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDay(d);
};

test('correct answers extend the streak along the review intervals', async () => {
  const { service } = makeService();
  const rec = async () => (await service.recordAnswers({ answers: [{ id: 'q', correct: true }] })).answers.q;

  assert.equal((await rec()).streak, 1);
  assert.equal((await rec()).streak, 2);
  assert.equal((await rec()).streak, 3);
  const fourth = await rec();
  assert.equal(fourth.streak, 4);
  assert.equal(fourth.due, dayOffset(16), 'streak 4 -> 16 days');
  const fifth = await rec();
  assert.equal(fifth.due, dayOffset(35), 'streak 5 -> 35 days');
  const sixth = await rec();
  assert.equal(sixth.streak, 6);
  assert.equal(sixth.due, dayOffset(35), 'streak beyond the table stays at 35 days');
});

test('an error resets the streak and brings the review to tomorrow', async () => {
  const { service } = makeService();
  await service.recordAnswers({ answers: [{ id: 'q', correct: true }, { id: 'q', correct: true }] });
  const afterError = (await service.recordAnswers({ answers: [{ id: 'q', correct: false }] })).answers.q;
  assert.equal(afterError.streak, 0);
  assert.equal(afterError.due, dayOffset(1));

  const afterFix = (await service.recordAnswers({ answers: [{ id: 'q', correct: true }] })).answers.q;
  assert.equal(afterFix.streak, 1, 'the streak restarts from one');
  assert.equal(afterFix.due, dayOffset(1));
});

test('migration of a pre-L6a snapshot derives streak and due per the rule', async () => {
  const { migrateProgress } = await import('../public/js/domain/progress.js');

  const legacy = {
    profile: { name: 'Valentin', language: 'ru' },
    answers: {
      'q-right': { correct: 4, wrong: 1, lastCorrect: true, last: '2026-09-28T10:00:00.000Z' },
      'q-wrong': { correct: 2, wrong: 5, lastCorrect: false, last: '2026-09-29T10:00:00.000Z' },
      'q-quiet': { correct: 1, wrong: 0, lastCorrect: true },
    },
    mistakes: ['q-wrong'],
  };

  const m = migrateProgress(legacy);
  assert.equal(m.answers['q-right'].streak, 1, 'lastCorrect -> streak 1');
  assert.equal(m.answers['q-right'].due, '2026-09-29', 'due = last day + 1');
  assert.equal(m.answers['q-wrong'].streak, 0, 'not lastCorrect -> streak 0');
  assert.equal(m.answers['q-wrong'].due, '2026-09-30');
  assert.equal(m.answers['q-quiet'].streak, 1);
  assert.ok(m.answers['q-quiet'].due, 'no last date -> still a due date');
});

test('migration trusts well-formed streak/due and repairs broken ones', async () => {
  const { migrateProgress } = await import('../public/js/domain/progress.js');
  const m = migrateProgress({
    answers: {
      good: { correct: 2, wrong: 0, lastCorrect: true, last: '2026-09-28T10:00:00.000Z', streak: 4, due: '2026-10-14' },
      broken: { correct: 1, wrong: 0, lastCorrect: true, last: '2026-09-28T10:00:00.000Z', streak: 'seven', due: 'next week' },
    },
  });
  assert.deepEqual([m.answers.good.streak, m.answers.good.due], [4, '2026-10-14'], 'valid fields survive');
  assert.equal(m.answers.broken.streak, 1, 'a broken streak falls back to the derived value');
  assert.equal(m.answers.broken.due, '2026-09-29');
});

test('import derives missing streak/due and rejects garbage values', async () => {
  const { service } = makeService();
  const snap = await service.importProgress({
    answers: {
      derived: { correct: 1, wrong: 0, lastCorrect: true, last: '2026-09-28T10:00:00.000Z' },
      trusted: { correct: 2, wrong: 0, lastCorrect: true, streak: 4, due: '2026-10-14' },
    },
  });
  assert.equal(snap.answers.derived.streak, 1);
  assert.equal(snap.answers.derived.due, '2026-09-29');
  assert.deepEqual([snap.answers.trusted.streak, snap.answers.trusted.due], [4, '2026-10-14']);
  assert.equal(snap.stats.mastered, 1, 'only streak >= 2 counts as mastered');

  for (const payload of [
    { answers: { 'q-1': { correct: 1, wrong: 0, lastCorrect: true, streak: 'soon' } } },
    { answers: { 'q-1': { correct: 1, wrong: 0, lastCorrect: true, due: 42 } } },
  ]) {
    await assert.rejects(() => service.importProgress(payload), ValidationError);
  }
});

test('an exported snapshot re-imports with streak and due intact', async () => {
  const { service } = makeService();
  await service.recordAnswers({ answers: [{ id: 'q', correct: true }, { id: 'q', correct: true }] });
  const exported = JSON.parse(JSON.stringify(service.snapshot()));
  delete exported.stats;
  const reimported = await service.importProgress(exported);
  assert.deepEqual([reimported.answers.q.streak, reimported.answers.q.due], [2, dayOffset(3)]);
});

test('dueReview picks cards whose review day has come, oldest due first', async () => {
  const { dueReview, dueReviewCount } = await import('../public/js/domain/progress.js');

  const answers = {
    'q-future': { correct: 1, wrong: 0, lastCorrect: true, streak: 2, due: dayOffset(3) },
    'q-due-yesterday': { correct: 1, wrong: 1, lastCorrect: false, streak: 0, due: dayOffset(-1) },
    'q-due-today': { correct: 1, wrong: 0, lastCorrect: true, streak: 1, due: dayOffset(0) },
    'q-no-due': { correct: 1, wrong: 0, lastCorrect: true, streak: 0 }, // pre-L6a record
  };

  assert.deepEqual(dueReview(answers), ['q-due-yesterday', 'q-due-today']);
  assert.equal(dueReviewCount(answers), 2);
  assert.deepEqual(dueReview({}), []);
});

// S3.6 — the dashboard nudge: below today's goal AND away for ≥ 12h.
import { shouldRemind, latestActivity, REMIND_AFTER_MS } from '../public/js/domain/progress.js';

function remindProgress({ answeredToday = 0, last = '', goal = 20 } = {}) {
  const rec = last ? { last } : undefined;
  return {
    profile: { dailyGoal: goal },
    dailyAnswers: answeredToday ? { [dayOffset(0)]: answeredToday } : {},
    answers: rec ? { q: rec } : {},
  };
}
const at = (h) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

test('shouldRemind: below goal + away ≥12h shows, otherwise hidden (S3.6)', () => {
  assert.equal(shouldRemind(remindProgress({ last: at(13) })), true, '13h away, goal missed');
  assert.equal(shouldRemind(remindProgress({ last: at(11.9) })), false, '11.9h away — not inactive yet');
  assert.equal(shouldRemind(remindProgress({ last: at(0) })), false, 'just answered');
  assert.equal(shouldRemind(remindProgress({ last: at(30), answeredToday: 20 })), false, 'goal already reached today');
  assert.equal(shouldRemind(remindProgress({ last: at(30), answeredToday: 19, goal: 20 })), true, 'one short of the goal');
  assert.equal(shouldRemind(remindProgress({ last: at(30), answeredToday: 50, goal: 20 })), false, 'over the goal');
  assert.equal(shouldRemind(remindProgress({})), true, 'fresh profile, never answered');
  assert.equal(shouldRemind(remindProgress({ last: 'garbage-string' })), true, 'unparseable last counts as long away');
  assert.equal(shouldRemind(null), false, 'no progress -> no nudge');
  // last was 15h ago; if we evaluate at 6h ago (now = real - 6h), elapsed = 9h < 12h
  assert.equal(shouldRemind(remindProgress({ last: at(15) }), Date.now() - REMIND_AFTER_MS / 2), false, 'explicit now: only 9h away then');
});

test('latestActivity: newest answer timestamp, ignores junk (S3.6)', () => {
  assert.equal(latestActivity({}), '');
  assert.equal(latestActivity({ q: { last: '' } }), '');
  // Fix the timestamps once — calling at() twice can land on different
  // milliseconds and would make the fixture itself flaky.
  const t1 = at(1);
  const t5 = at(5);
  assert.equal(latestActivity({ a: { last: at(24) }, b: { last: t1 } }), t1);
  assert.equal(latestActivity({ a: { last: 'nonsense' }, b: { last: t5 } }), t5);
  assert.equal(latestActivity(null), '');
});

test('the snapshot reports how many cards are due for review today', async () => {
  const { service } = makeService();
  assert.equal(service.snapshot().stats.reviewDue, 0, 'nothing answered -> nothing due');

  await service.recordAnswers({ answers: [{ id: 'q', correct: true }] }); // due tomorrow
  assert.equal(service.snapshot().stats.reviewDue, 0, 'a fresh correct answer is not due yet');

  await service.recordAnswers({ answers: [{ id: 'q2', correct: false }] }); // due tomorrow
  await service.recordAnswers({ answers: [{ id: 'q2', correct: false }] }); // answered today, due tomorrow
  assert.equal(service.snapshot().stats.reviewDue, 0);

  const due = dayOffset(-1);
  service.store.data.answers.q.due = due; // simulate a review that has come due
  service.store.data.answers.q2.due = dayOffset(0); // one due today, one overdue
  assert.equal(service.snapshot().stats.reviewDue, 2);
});

// S3.5 — shareText: share text for exam/session results.
import { shareText } from '../public/js/domain/progress.js';

test('shareText: exam result in ru (spec example and plurals)', () => {
  assert.equal(
    shareText({ kind: 'exam', total: 30, errors: 3, lang: 'ru' }),
    'Пройден пробный экзамен: 27/30, 3 ошибки — Passo',
  );
  assert.equal(
    shareText({ kind: 'exam', total: 30, errors: 1, lang: 'ru' }),
    'Пройден пробный экзамен: 29/30, 1 ошибка — Passo',
  );
  assert.equal(
    shareText({ kind: 'exam', total: 30, errors: 5, lang: 'ru' }),
    'Пройден пробный экзамен: 25/30, 5 ошибок — Passo',
  );
  assert.equal(
    shareText({ kind: 'exam', total: 30, errors: 0, lang: 'ru' }),
    'Пройден пробный экзамен: 30/30, без ошибок — Passo',
  );
});

test('shareText: exam result in en and zh, no URL', () => {
  const en = shareText({ kind: 'exam', total: 30, errors: 3, lang: 'en' });
  assert.equal(en, 'Mock exam completed: 27/30, 3 errors — Passo');
  assert.equal(en, shareText({ kind: 'exam', total: 30, errors: 3 })); // lang defaults to en
  const zh = shareText({ kind: 'exam', total: 30, errors: 3, lang: 'zh' });
  assert.ok(zh.includes('27/30') && zh.includes('Passo'), `zh text: ${zh}`);
  for (const s of [en, zh, shareText({ kind: 'exam', total: 30, errors: 3, lang: 'ru' })]) {
    assert.ok(!/https?:\/\//.test(s), `share text must not contain a URL: ${s}`);
  }
});

test('shareText: session result', () => {
  assert.equal(
    shareText({ kind: 'session', total: 20, errors: 2, lang: 'ru' }),
    'Тренировка: 18/20 правильных — Passo',
  );
  assert.equal(
    shareText({ kind: 'session', total: 20, errors: 2, lang: 'en' }),
    'Practice session: 18/20 correct — Passo',
  );
});

test('shareText: invalid input throws ValidationError', () => {
  assert.throws(() => shareText(null), ValidationError);
  assert.throws(() => shareText({ kind: 'quiz', total: 30, errors: 3 }), ValidationError);
  assert.throws(() => shareText({ kind: 'exam', total: 0, errors: 0 }), ValidationError);
  assert.throws(() => shareText({ kind: 'exam', total: 30, errors: 31 }), ValidationError);
  assert.throws(() => shareText({ kind: 'exam', total: 30, errors: -1 }), ValidationError);
});
