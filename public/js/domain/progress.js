import { PATH_MINI_PASS, PATH_CHECK_QUESTIONS } from './learning.js';

export const LANGUAGES = ['en', 'ru', 'zh'];
export const THEMES = ['light', 'dark', 'auto'];
export const SIGNAL_HINT_MODES = ['auto', 'on', 'off'];

// The daily-goal ring on the dashboard: how many questions a day the user
// aims for. A constant per user is stored in the profile, not in code.
export const DAILY_GOAL_MIN = 5;
export const DAILY_GOAL_MAX = 200;
export const DAILY_GOAL_DEFAULT = 20;

const NAME_MAX = 40;
const ID_MAX = 120;
// Question / chapter ids in the bank only ever use this alphabet. Anything
// else — notably `constructor`, `prototype`, `__proto__`, `toString`,
// `hasOwnProperty`, `valueOf` — is rejected, so a stored or imported key can
// never reach a prototype method through an `obj[id]` access.
const ID_RE = /^[A-Za-z0-9_-]{1,120}$/;
// Store growth caps (SEC3): progress must not grow without a bound.
const MAX_STORE_ANSWERS = 8000;
const MAX_STORE_EXAMS = 400;
const MAX_STORE_DAILY_DAYS = 400;
// Import caps: generous enough for a full bank, small enough to bound work.
const MAX_IMPORT_ANSWERS = 20000;
const ACTIVE_DAYS_KEPT = 90;

/**
 * Bumped only when the stored shape changes in a way that needs code to
 * translate it. migrateProgress() below is what actually does the work,
 * so a saved snapshot keeps opening after the app is updated.
 */
export const SCHEMA_VERSION = 2;

// Spaced repetition (L6a): days until the next review, indexed by the
// consecutive-correct streak (capped at the last interval).
export const REVIEW_INTERVALS = [1, 3, 7, 16, 35];
// "Mastered" (L6a) — a question needs two correct answers in a row,
// not just one.
export const MASTERY_STREAK = 2;

export const EMPTY_PROGRESS = {
  version: SCHEMA_VERSION,
  profile: { name: '', language: 'en', theme: 'auto', sound: true, dailyGoal: DAILY_GOAL_DEFAULT, signalHints: 'auto', onboarded: false },
  answers: {}, // questionId -> { correct, wrong, lastCorrect, last, streak, due }
  mistakes: [], // questionIds currently answered wrong
  exams: [], // { date, total, errors, passed }
  activeDays: [], // YYYY-MM-DD of every day with activity (last 90)
  dailyAnswers: {}, // YYYY-MM-DD -> answers given that day (last 90)
  theoryRead: [], // chapter ids
  chapters: {}, // chapterId -> { check: N } (best self-check score, L5b)
  streak: { current: 0, lastDay: '', shields: 0, best: 0 },
};

/**
 * L6b — questions whose review date has come (due <= today). `answers` maps
 * questionId -> answer record; entries without `due` (pre-L6a data) are
 * skipped. Returned oldest-first so the review queue shows the most overdue
 * cards first; ids are deduplicated.
 */
export function dueReview(answers, day = today()) {
  const out = [];
  for (const [id, a] of Object.entries(answers || {})) {
    if (a && typeof a.due === 'string' && a.due.length === 10 && a.due <= day) out.push([id, a.due]);
  }
  return out.sort((x, y) => x[1].localeCompare(y[1]) || x[0].localeCompare(y[0]))
    .map(([id]) => id);
}

/** Count of questions due for review today (answers.due <= today). */
export function dueReviewCount(answers, day = today()) {
  return dueReview(answers, day).length;
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

function assertObject(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object');
  }
  return body;
}

// Own-property test that is safe on prototype-less objects, unlike
// `obj.hasOwnProperty` — a key literally named `hasOwnProperty` would
// shadow the inherited method and throw.
function hasOwn(obj, key) {
  return Object.hasOwn(obj, key);
}

// Keys that name a method on Object.prototype. They pass the id alphabet
// check (they are plain words), so they must be rejected explicitly: stored
// under such a key they would shadow the inherited method on every later
// `answers[id]` / `chapters[id]` read.
const FORBIDDEN_IDS = new Set([
  'constructor',
  'prototype',
  '__proto__',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

function assertId(value, field) {
  if (!isSafeId(value)) {
    throw new ValidationError(`"${field}" must be a non-empty id of letters, digits, "-" or "_"`);
  }
  return value;
}

// The migration counterpart of assertId: drop unsafe keys silently instead of
// throwing, so a stray key in an old snapshot loses only that record.
function isSafeId(value) {
  return typeof value === 'string' && ID_RE.test(value) && !FORBIDDEN_IDS.has(value);
}

function assertDailyGoal(value, field = 'dailyGoal') {
  if (!Number.isInteger(value) || value < DAILY_GOAL_MIN || value > DAILY_GOAL_MAX) {
    throw new ValidationError(`"${field}" must be an integer between ${DAILY_GOAL_MIN} and ${DAILY_GOAL_MAX}`);
  }
  return value;
}

/**
 * The local calendar date, not the UTC one: a session at 23:30 in Rome
 * belongs to that day, and toISOString() would file it under tomorrow.
 */
function today(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The calendar day before an ISO date — DST-safe, unlike subtracting 24h. */
function dayBefore(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return today(date);
}

/** The ISO date N calendar days after `from` (default: today). DST-safe. */
export function addDays(from, n, date = new Date()) {
  const base = from
    ? new Date(...from.split('-').map(Number).map((v, i) => (i === 1 ? v - 1 : v)))
    : new Date(date);
  base.setDate(base.getDate() + n);
  return today(base);
}

const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** S3.6 — "last activity" is the latest answer timestamp in `answers`. */
export function latestActivity(answers) {
  let max = '';
  if (answers && typeof answers === 'object') {
    for (const rec of Object.values(answers)) {
      const last = rec && typeof rec.last === 'string' ? rec.last : '';
      if (Date.parse(last) > 0 && last > max) max = last;
    }
  }
  return max;
}

/** S3.6 — a learner "counts as inactive" once this much time has passed. */
export const REMIND_AFTER_MS = 12 * 60 * 60 * 1000;

/**
 * S3.6 — show the dashboard reminder when the learner has not reached today's
 * goal AND has been away for REMIND_AFTER_MS (or never answered at all).
 * A fresh profile has no `last` timestamps, so it is treated as "long away".
 */
export function shouldRemind(progress, now = Date.now()) {
  if (!progress || typeof progress !== 'object') return false;
  const answeredToday = (progress.dailyAnswers && progress.dailyAnswers[today()]) || 0;
  const goal = Number(progress.profile && progress.profile.dailyGoal) || DAILY_GOAL_DEFAULT;
  if (answeredToday >= goal) return false;
  const last = latestActivity(progress.answers);
  return last === '' || now - Date.parse(last) >= REMIND_AFTER_MS;
}

/** S3.7a — did the learner hit the daily goal on a given day? */
export function goalReachedOn(dailyAnswers, day, goal) {
  const g = Number(goal) || DAILY_GOAL_DEFAULT;
  return (Number(dailyAnswers && dailyAnswers[day]) || 0) >= g;
}

/**
 * S3.7a — streak update with the one-day shield. Pure: returns the new
 * `{ current, lastDay, shields, best }` for the first activity on `day`.
 *
 * The shield is earned when a day's answers reach the goal, lives as long
 * as the streak itself (an unspent one dies only when the streak resets),
 * and is spent to bridge exactly one missed day. A gap of two days resets
 * the streak to 1 either way. `best` is the longest streak ever reached.
 */
export function streakShieldState(streak, day, dailyAnswers, goal) {
  const earned = goalReachedOn(dailyAnswers, day, goal) ? 1 : 0;
  const best = Math.max(Number(streak.best) || 0);
  if (streak.lastDay === day) {
    return { ...streak, shields: earned || streak.shields };
  }
  if (streak.lastDay === dayBefore(day)) {
    const current = streak.current + 1;
    return { ...streak, current, lastDay: day, shields: earned || streak.shields, best: Math.max(best, current) };
  }
  // Exactly one skipped day: the shield forgives it; current is unchanged.
  if (streak.lastDay && streak.lastDay === dayBefore(dayBefore(day)) && streak.shields === 1) {
    return { ...streak, lastDay: day, shields: 0 };
  }
  return { current: 1, lastDay: day, shields: earned, best: Math.max(best, 1) };
}

/**
 * L6a — recovers the spaced-repetition fields of an answer record.
 * Records written before `streak`/`due` existed are re-derived:
 * streak = lastCorrect ? 1 : 0, due = the day after the last activity
 * (a question with no history is due tomorrow). A broken field falls
 * back to the derived value instead of being trusted.
 */
function reviewFieldsFromRecord(rec, lastCorrect, last) {
  const streak = Math.trunc(Number(rec.streak));
  const due = isDay(rec.due) ? rec.due : addDays(isDay(last.slice(0, 10)) ? last.slice(0, 10) : '', 1);
  return {
    streak: Number.isFinite(streak) && streak > 0 ? streak : lastCorrect ? 1 : 0,
    due,
  };
}


const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Keeps only well-formed date strings from an array, deduped and sorted. */
function cleanDays(value, cap) {
  if (!Array.isArray(value)) return [];
  const days = value.filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));
  return [...new Set(days)].sort().slice(-cap);
}

/**
 * S3.5 — share text for the exam and session result screens.
 * No URL on purpose: the app is privacy-first (CSP 'self', "nothing
 * leaves the device"), so the text is a plain sentence with the app
 * name as the only brand. Pure function — covered by tests.
 */
export const SHARE_APP_NAME = 'Passo';

/** Russian plural for «ошибка» (0/1/2-4/5+), e.g. 3 ошибки, 5 ошибок. */
function ruErrorWord(n) {
  if (n === 0) return 'без ошибок';
  if (n === 1) return '1 ошибка';
  const d10 = n % 10, d100 = n % 100;
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return `${n} ошибки`;
  return `${n} ошибок`;
}

export function shareText(result) {
  if (!isPlainObject(result)) {
    throw new ValidationError('shareText: result must be an object');
  }
  const { kind, total, errors, lang } = result;
  if (kind !== 'exam' && kind !== 'session') {
    throw new ValidationError('shareText: "kind" must be "exam" or "session"');
  }
  if (!Number.isInteger(total) || total < 1) {
    throw new ValidationError('shareText: "total" must be a positive integer');
  }
  if (!Number.isInteger(errors) || errors < 0 || errors > total) {
    throw new ValidationError('shareText: "errors" must be an integer between 0 and total');
  }
  const correct = total - errors;
  const l = LANGUAGES.includes(lang) ? lang : 'en';

  if (kind === 'exam') {
    if (l === 'ru') return `Пройден пробный экзамен: ${correct}/${total}, ${ruErrorWord(errors)} — ${SHARE_APP_NAME}`;
    if (l === 'zh') return `模拟考试完成：${correct}/${total}，${errors === 0 ? '无错误' : `错误 ${errors} 个`} — ${SHARE_APP_NAME}`;
    return `Mock exam completed: ${correct}/${total}, ${errors === 0 ? 'no errors' : errors === 1 ? '1 error' : `${errors} errors`} — ${SHARE_APP_NAME}`;
  }
  if (l === 'ru') return `Тренировка: ${correct}/${total} правильных — ${SHARE_APP_NAME}`;
  if (l === 'zh') return `练习：${correct}/${total} 答对 — ${SHARE_APP_NAME}`;
  return `Practice session: ${correct}/${total} correct — ${SHARE_APP_NAME}`;
}

/**
 * Brings a stored snapshot up to the current shape.
 *
 * Unlike importProgress(), which rejects a bad file so the user is told,
 * this is deliberately forgiving: it is reading data the app itself wrote,
 * possibly by an older version, and losing a study history because one
 * field went strange would be far worse than dropping that field. Anything
 * unrecognised is skipped; everything valid is carried across.
 */
export function migrateProgress(raw) {
  const out = structuredClone(EMPTY_PROGRESS);
  if (!isPlainObject(raw)) return out;

  const p = raw.profile;
  if (isPlainObject(p)) {
    if (typeof p.name === 'string') out.profile.name = p.name.slice(0, NAME_MAX);
    if (LANGUAGES.includes(p.language)) out.profile.language = p.language;
    // A valid stored theme is kept as-is (old profiles are not migrated). A
    // corrupted value falls back to an explicit 'light' — never to 'auto',
    // which is only the default for genuinely new profiles.
    if (THEMES.includes(p.theme)) out.profile.theme = p.theme;
    else out.profile.theme = 'light';
    if (typeof p.sound === 'boolean') out.profile.sound = p.sound;
    // A snapshot written before the goal was configurable simply gets the
    // default; a broken value is dropped rather than trusted.
    const goal = Math.trunc(Number(p.dailyGoal));
    if (Number.isFinite(goal) && goal >= DAILY_GOAL_MIN && goal <= DAILY_GOAL_MAX) {
      out.profile.dailyGoal = goal;
    }
    if (SIGNAL_HINT_MODES.includes(p.signalHints)) out.profile.signalHints = p.signalHints;
    if (typeof p.onboarded === 'boolean') out.profile.onboarded = p.onboarded;
  }

  if (isPlainObject(raw.answers)) {
    for (const [id, rec] of Object.entries(raw.answers)) {
      // A key outside the bank alphabet (constructor, __proto__, …) is dropped,
      // not trusted, so it can never shadow a prototype method later on.
      if (!isSafeId(id) || !isPlainObject(rec)) continue;
      const correct = Math.trunc(Number(rec.correct));
      const wrong = Math.trunc(Number(rec.wrong));
      if (!Number.isFinite(correct) || !Number.isFinite(wrong)) continue;
      const lastCorrect = Boolean(rec.lastCorrect);
      const last = typeof rec.last === 'string' ? rec.last.slice(0, 40) : '';
      out.answers[id] = {
        correct: Math.max(0, correct),
        wrong: Math.max(0, wrong),
        lastCorrect,
        last,
        ...reviewFieldsFromRecord(rec, lastCorrect, last),
      };
    }
  }

  for (const field of ['mistakes', 'theoryRead']) {
    if (!Array.isArray(raw[field])) continue;
    out[field] = raw[field].filter(isSafeId);
  }
  // A mistake only means something if the answer behind it is still wrong.
  out.mistakes = out.mistakes.filter((id) => hasOwn(out.answers, id) && !out.answers[id].lastCorrect);

  if (isPlainObject(raw.chapters)) {
    for (const [id, rec] of Object.entries(raw.chapters)) {
      if (!isSafeId(id) || !isPlainObject(rec)) continue;
      const check = Math.trunc(Number(rec.check));
      if (Number.isFinite(check) && check >= 0 && check <= PATH_CHECK_QUESTIONS) {
        out.chapters[id] = { check };
      }
    }
  }

  if (Array.isArray(raw.exams)) {
    for (const exam of raw.exams) {
      if (!isPlainObject(exam)) continue;
      const total = Math.trunc(Number(exam.total));
      const errors = Math.trunc(Number(exam.errors));
      if (!Number.isFinite(total) || total <= 0) continue;
      if (!Number.isFinite(errors) || errors < 0 || errors > total) continue;
      out.exams.push({
        date: typeof exam.date === 'string' ? exam.date.slice(0, 40) : '',
        total,
        errors,
        passed: Boolean(exam.passed),
      });
    }
  }

  if (isPlainObject(raw.streak)) {
    const current = Math.trunc(Number(raw.streak.current));
    const best = Math.trunc(Number(raw.streak.best));
    // A pre-S3.7a snapshot simply has no shield; only an explicit 0/1 survives.
    const shields = Number(raw.streak.shields);
    out.streak = {
      current: Number.isFinite(current) && current > 0 ? current : 0,
      lastDay: typeof raw.streak.lastDay === 'string' ? raw.streak.lastDay.slice(0, 10) : '',
      shields: shields === 1 ? 1 : 0,
      best: Number.isFinite(best) && best > 0 ? best : 0,
    };
  }

  out.activeDays = cleanDays(raw.activeDays, ACTIVE_DAYS_KEPT);

  if (isPlainObject(raw.dailyAnswers)) {
    for (const [day, count] of Object.entries(raw.dailyAnswers)) {
      if (day === '__proto__' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const n = Math.trunc(Number(count));
      if (Number.isFinite(n) && n > 0) out.dailyAnswers[day] = n;
    }
  }
  // SEC3 hard caps for old snapshots: newest entries are kept.
  out.exams = out.exams.slice(-MAX_STORE_EXAMS);
  const dailyDays = Object.keys(out.dailyAnswers).sort();
  for (const day of dailyDays.slice(0, Math.max(0, dailyDays.length - MAX_STORE_DAILY_DAYS))) {
    delete out.dailyAnswers[day];
  }

  // Days the user studied are implied by the counters too, so a snapshot
  // written before activeDays existed still lights up the week strip.
  for (const day of Object.keys(out.dailyAnswers)) {
    if (!out.activeDays.includes(day)) out.activeDays.push(day);
  }
  if (out.streak.lastDay && !out.activeDays.includes(out.streak.lastDay)) {
    out.activeDays.push(out.streak.lastDay);
  }
  out.activeDays = cleanDays(out.activeDays, ACTIVE_DAYS_KEPT);

  out.version = SCHEMA_VERSION;
  return out;
}

/**
 * All progress mutations live here, server-side, so the data file stays
 * consistent no matter what the client sends.
 */
export class ProgressService {
  constructor(store) {
    this.store = store;
  }

  snapshot() {
    const d = this.store.data;
    const answered = Object.keys(d.answers).length;
    const mastered = Object.values(d.answers).filter((a) => a.streak >= MASTERY_STREAK).length;
    const passed = d.exams.filter((e) => e.passed).length;
    return {
      ...d,
      stats: {
        answered,
        mastered,
        reviewDue: dueReviewCount(d.answers),
        mistakes: d.mistakes.length,
        examsTaken: d.exams.length,
        examsPassed: passed,
        examSuccess: d.exams.length ? Math.round((passed / d.exams.length) * 100) : 0,
        streak: d.streak.current,
        // S3.9a: the longest streak ever reached (screen «Рекорды»).
        streakBest: d.streak.best,
        // S3.7b: the unspent streak shield, so the dashboard can show it.
        shield: d.streak.shields === 1 ? 1 : 0,
      },
    };
  }

  bumpStreak() {
    const d = this.store.data;
    const day = today();

    // The day is recorded even when the streak itself does not change, so
    // the dashboard can show which days of the week were studied.
    if (!Array.isArray(d.activeDays)) d.activeDays = [];
    if (!d.activeDays.includes(day)) {
      d.activeDays.push(day);
      if (d.activeDays.length > ACTIVE_DAYS_KEPT) {
        d.activeDays = d.activeDays.slice(-ACTIVE_DAYS_KEPT);
      }
    }

    if (d.streak.lastDay === day) {
      // The day is already counted, but the goal can still be reached later.
      d.streak.shields = goalReachedOn(d.dailyAnswers, day, d.profile.dailyGoal) ? 1 : d.streak.shields;
      return;
    }
    d.streak = streakShieldState(d.streak, day, d.dailyAnswers, d.profile.dailyGoal);
  }

  /** Per-day answer counts drive the dashboard's daily-goal ring. */
  countTowardsToday(n) {
    if (!n) return;
    const d = this.store.data;
    if (!d.dailyAnswers || typeof d.dailyAnswers !== 'object') d.dailyAnswers = {};
    const day = today();
    d.dailyAnswers[day] = (d.dailyAnswers[day] ?? 0) + n;
    const days = Object.keys(d.dailyAnswers).sort();
    if (days.length > ACTIVE_DAYS_KEPT) {
      for (const old of days.slice(0, days.length - ACTIVE_DAYS_KEPT)) delete d.dailyAnswers[old];
    }
  }

  async updateProfile(body) {
    assertObject(body);
    const profile = this.store.data.profile;
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.length > NAME_MAX) {
        throw new ValidationError(`"name" must be a string of at most ${NAME_MAX} characters`);
      }
      profile.name = body.name.trim();
    }
    if (body.language !== undefined) {
      if (!LANGUAGES.includes(body.language)) {
        throw new ValidationError(`"language" must be one of: ${LANGUAGES.join(', ')}`);
      }
      profile.language = body.language;
    }
    if (body.theme !== undefined) {
      if (!THEMES.includes(body.theme)) {
        throw new ValidationError(`"theme" must be one of: ${THEMES.join(', ')}`);
      }
      profile.theme = body.theme;
    }
    if (body.sound !== undefined) {
      if (typeof body.sound !== 'boolean') {
        throw new ValidationError('"sound" must be a boolean');
      }
      profile.sound = body.sound;
    }
    if (body.dailyGoal !== undefined) {
      profile.dailyGoal = assertDailyGoal(body.dailyGoal);
    }
    if (body.signalHints !== undefined) {
      if (!SIGNAL_HINT_MODES.includes(body.signalHints)) {
        throw new ValidationError(`"signalHints" must be one of: ${SIGNAL_HINT_MODES.join(', ')}`);
      }
      profile.signalHints = body.signalHints;
    }
    if (body.onboarded !== undefined) {
      if (typeof body.onboarded !== 'boolean') {
        throw new ValidationError('"onboarded" must be a boolean');
      }
      profile.onboarded = body.onboarded;
    }
    await this.store.persist();
    return profile;
  }

  /** Records a batch of answers: [{ id, correct }] */
  async recordAnswers(body) {
    assertObject(body);
    if (!Array.isArray(body.answers) || body.answers.length === 0) {
      throw new ValidationError('"answers" must be a non-empty array');
    }
    if (body.answers.length > 100) {
      throw new ValidationError('"answers" must contain at most 100 items');
    }
    const d = this.store.data;
    // SEC3: reject before any entry is applied, so an over-cap batch leaves
    // the store untouched.
    const newIds = new Set(body.answers.filter((e) => e && !hasOwn(d.answers, e.id)).map((e) => e.id));
    if (Object.keys(d.answers).length + newIds.size > MAX_STORE_ANSWERS) {
      throw new ValidationError(`"answers" holds more than ${MAX_STORE_ANSWERS} entries`);
    }
    let answeredNow = 0;
    for (const entry of body.answers) {
      assertObject(entry);
      const id = assertId(entry.id, 'answers[].id');
      if (typeof entry.correct !== 'boolean') {
        throw new ValidationError('"answers[].correct" must be a boolean');
      }
      const rec = hasOwn(d.answers, id) ? d.answers[id] : { correct: 0, wrong: 0, lastCorrect: false, last: '', streak: 0, due: '' };
      if (entry.correct) {
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
      rec.lastCorrect = entry.correct;
      rec.last = new Date().toISOString();
      d.answers[id] = rec;
      answeredNow += 1;
    }
    this.countTowardsToday(answeredNow);
    this.bumpStreak();
    await this.store.persist();
    return this.snapshot();
  }

  async recordExam(body) {
    assertObject(body);
    const total = body.total;
    const errors = body.errors;
    if (!Number.isInteger(total) || total < 1 || total > 100) {
      throw new ValidationError('"total" must be an integer between 1 and 100');
    }
    if (!Number.isInteger(errors) || errors < 0 || errors > total) {
      throw new ValidationError('"errors" must be an integer between 0 and "total"');
    }
    if (this.store.data.exams.length >= MAX_STORE_EXAMS) {
      throw new ValidationError(`"exams" holds the maximum of ${MAX_STORE_EXAMS} entries`);
    }
    const exam = {
      date: new Date().toISOString(),
      total,
      errors,
      passed: typeof body.passed === 'boolean' ? body.passed : errors <= 3,
    };
    this.store.data.exams.push(exam);
    this.bumpStreak();
    await this.store.persist();
    return exam;
  }

  async markTheoryRead(body) {
    assertObject(body);
    const id = assertId(body.chapterId, 'chapterId');
    const list = this.store.data.theoryRead;
    if (!list.includes(id)) list.push(id);
    await this.store.persist();
    return { theoryRead: list };
  }

  /** L5b — the chapter self-check score. Only a better score is kept:
   *  a learner who passes once does not lose that by failing later. */
  async recordChapterCheck(body) {
    assertObject(body);
    const id = assertId(body.chapterId, 'chapterId');
    const correct = Number(body.correct);
    if (!Number.isInteger(correct) || correct < 0 || correct > PATH_CHECK_QUESTIONS) {
      throw new ValidationError(`"correct" must be an integer between 0 and ${PATH_CHECK_QUESTIONS}`);
    }
    const data = this.store.data;
    if (!isPlainObject(data.chapters)) data.chapters = {};
    const rec = hasOwn(data.chapters, id) && isPlainObject(data.chapters[id]) ? data.chapters[id] : { check: 0 };
    rec.check = Math.max(rec.check, correct);
    data.chapters[id] = rec;
    await this.store.persist();
    return { chapters: { [id]: rec } };
  }

  async reset() {
    await this.store.reset();
    return this.snapshot();
  }

  /**
   * Replaces all progress with a previously exported backup. The payload
   * comes from a file the user picked, so every field is validated and
   * anything unknown is dropped rather than trusted.
   */
  async importProgress(body) {
    assertObject(body);
    const clean = structuredClone(EMPTY_PROGRESS);

    const profile = body.profile;
    if (profile !== undefined) {
      assertObject(profile);
      if (profile.name !== undefined) {
        if (typeof profile.name !== 'string' || profile.name.length > NAME_MAX) {
          throw new ValidationError(`"profile.name" must be a string of at most ${NAME_MAX} characters`);
        }
        clean.profile.name = profile.name.trim();
      }
      if (profile.language !== undefined) {
        if (!LANGUAGES.includes(profile.language)) {
          throw new ValidationError(`"profile.language" must be one of: ${LANGUAGES.join(', ')}`);
        }
        clean.profile.language = profile.language;
      }
      if (profile.theme !== undefined) {
        if (!THEMES.includes(profile.theme)) {
          throw new ValidationError(`"profile.theme" must be one of: ${THEMES.join(', ')}`);
        }
        clean.profile.theme = profile.theme;
      }
      if (profile.sound !== undefined) {
        if (typeof profile.sound !== 'boolean') {
          throw new ValidationError('"profile.sound" must be a boolean');
        }
        clean.profile.sound = profile.sound;
      }
      if (profile.dailyGoal !== undefined) {
        clean.profile.dailyGoal = assertDailyGoal(profile.dailyGoal, 'profile.dailyGoal');
      }
      if (profile.signalHints !== undefined) {
        if (!SIGNAL_HINT_MODES.includes(profile.signalHints)) {
          throw new ValidationError(`"profile.signalHints" must be one of: ${SIGNAL_HINT_MODES.join(', ')}`);
        }
        clean.profile.signalHints = profile.signalHints;
      }
      if (profile.onboarded !== undefined) {
        if (typeof profile.onboarded !== 'boolean') {
          throw new ValidationError('"profile.onboarded" must be a boolean');
        }
        clean.profile.onboarded = profile.onboarded;
      }
    }

    if (body.answers !== undefined) {
      assertObject(body.answers);
      const entries = Object.entries(body.answers);
      if (entries.length > MAX_STORE_ANSWERS) {
        throw new ValidationError(`"answers" holds more than ${MAX_STORE_ANSWERS} entries`);
      }
      for (const [id, rec] of entries) {
        assertId(id, 'answers key');
        assertObject(rec);
        const correct = Number(rec.correct);
        const wrong = Number(rec.wrong);
        if (!Number.isInteger(correct) || correct < 0 || !Number.isInteger(wrong) || wrong < 0) {
          throw new ValidationError(`"answers.${id}" counters must be non-negative integers`);
        }
        if (typeof rec.lastCorrect !== 'boolean') {
          throw new ValidationError(`"answers.${id}.lastCorrect" must be a boolean`);
        }
        if (rec.streak !== undefined && (!Number.isInteger(rec.streak) || rec.streak < 0)) {
          throw new ValidationError(`"answers.${id}.streak" must be a non-negative integer`);
        }
        if (rec.due !== undefined && !isDay(rec.due)) {
          throw new ValidationError(`"answers.${id}.due" must be a YYYY-MM-DD date`);
        }
        const last = typeof rec.last === 'string' ? rec.last.slice(0, 40) : '';
        clean.answers[id] = {
          correct,
          wrong,
          lastCorrect: rec.lastCorrect,
          last,
          ...reviewFieldsFromRecord(rec, rec.lastCorrect, last),
        };
      }
    }

    if (body.exams !== undefined) {
      if (!Array.isArray(body.exams)) throw new ValidationError('"exams" must be an array');
      if (body.exams.length > MAX_STORE_EXAMS) {
        throw new ValidationError(`"exams" holds more than ${MAX_STORE_EXAMS} entries`);
      }
      for (const exam of body.exams) {
        assertObject(exam);
        const total = Number(exam.total);
        const errors = Number(exam.errors);
        if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(errors) || errors < 0 || errors > total) {
          throw new ValidationError('"exams[]" needs a valid total and errors count');
        }
        clean.exams.push({
          date: typeof exam.date === 'string' ? exam.date.slice(0, 40) : new Date().toISOString(),
          total,
          errors,
          passed: Boolean(exam.passed),
        });
      }
    }

    if (body.activeDays !== undefined) {
      if (!Array.isArray(body.activeDays)) {
        throw new ValidationError('"activeDays" must be an array');
      }
      const days = body.activeDays.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day));
      clean.activeDays = [...new Set(days)].sort().slice(-ACTIVE_DAYS_KEPT);
    }

    if (body.dailyAnswers !== undefined) {
      assertObject(body.dailyAnswers);
      const days = Object.entries(body.dailyAnswers).filter(([day]) => /^\d{4}-\d{2}-\d{2}$/.test(day));
      if (days.length > MAX_STORE_DAILY_DAYS) {
        throw new ValidationError(`"dailyAnswers" holds more than ${MAX_STORE_DAILY_DAYS} days`);
      }
      for (const [day, count] of days) {
        const n = Number(count);
        if (!Number.isInteger(n) || n < 0) {
          throw new ValidationError(`"dailyAnswers.${day}" must be a non-negative integer`);
        }
        clean.dailyAnswers[day] = n;
      }
    }

    for (const field of ['mistakes', 'theoryRead']) {
      if (body[field] === undefined) continue;
      if (!Array.isArray(body[field])) throw new ValidationError(`"${field}" must be an array`);
      if (body[field].length > MAX_IMPORT_ANSWERS) {
        throw new ValidationError(`"${field}" is too long`);
      }
      clean[field] = body[field].map((id) => assertId(id, `${field}[]`));
    }

    if (body.chapters !== undefined) {
      assertObject(body.chapters);
      const entries = Object.entries(body.chapters);
      if (entries.length > MAX_IMPORT_ANSWERS) {
        throw new ValidationError('"chapters" is too long');
      }
      for (const [id, rec] of entries) {
        assertId(id, 'chapters key');
        assertObject(rec);
        const check = Number(rec.check);
        if (!Number.isInteger(check) || check < 0 || check > PATH_CHECK_QUESTIONS) {
          throw new ValidationError(`"chapters.${id}.check" must be an integer between 0 and ${PATH_CHECK_QUESTIONS}`);
        }
        clean.chapters[id] = { check };
      }
    }

    if (body.streak !== undefined) {
      assertObject(body.streak);
      const current = Number(body.streak.current);
      if (!Number.isInteger(current) || current < 0) {
        throw new ValidationError('"streak.current" must be a non-negative integer');
      }
      // S3.7a: the shield is an integer 0..1; junk (strings, floats, 2)
      // rejects the whole backup, like every other validated field.
      const rawShields = body.streak.shields;
      if (rawShields !== undefined && (typeof rawShields !== 'number' || !Number.isInteger(rawShields) || rawShields < 0 || rawShields > 1)) {
        throw new ValidationError('"streak.shields" must be an integer between 0 and 1');
      }
      const rawBest = body.streak.best;
      if (rawBest !== undefined && (typeof rawBest !== 'number' || !Number.isInteger(rawBest) || rawBest < 0)) {
        throw new ValidationError('"streak.best" must be a non-negative integer');
      }
      clean.streak = {
        current,
        lastDay: typeof body.streak.lastDay === 'string' ? body.streak.lastDay.slice(0, 10) : '',
        shields: rawShields === 1 ? 1 : 0,
        best: rawBest > 0 ? rawBest : 0,
      };
    }

    // Mistakes must stay consistent with the answers they refer to.
    clean.mistakes = clean.mistakes.filter((id) => hasOwn(clean.answers, id) && !clean.answers[id].lastCorrect);

    Object.assign(this.store.data, clean);
    await this.store.persist();
    return this.snapshot();
  }
}
