export const LANGUAGES = ['en', 'ru', 'zh'];
export const THEMES = ['light', 'dark'];

const NAME_MAX = 40;
const ID_MAX = 120;
// Import caps: generous enough for a full bank, small enough to bound work.
const MAX_IMPORT_ANSWERS = 20000;
const ACTIVE_DAYS_KEPT = 90;
const MAX_IMPORT_EXAMS = 2000;

export const EMPTY_PROGRESS = {
  profile: { name: '', language: 'en', theme: 'light', sound: true, onboarded: false },
  answers: {}, // questionId -> { correct, wrong, lastCorrect, last }
  mistakes: [], // questionIds currently answered wrong
  exams: [], // { date, total, errors, passed }
  activeDays: [], // YYYY-MM-DD of every day with activity (last 90)
  dailyAnswers: {}, // YYYY-MM-DD -> answers given that day (last 90)
  theoryRead: [], // chapter ids
  streak: { current: 0, lastDay: '' },
};

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

function assertId(value, field) {
  if (typeof value !== 'string' || !value || value.length > ID_MAX) {
    throw new ValidationError(`"${field}" must be a non-empty string`);
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
    const mastered = Object.values(d.answers).filter((a) => a.lastCorrect).length;
    const passed = d.exams.filter((e) => e.passed).length;
    return {
      ...d,
      stats: {
        answered,
        mastered,
        mistakes: d.mistakes.length,
        examsTaken: d.exams.length,
        examsPassed: passed,
        examSuccess: d.exams.length ? Math.round((passed / d.exams.length) * 100) : 0,
        streak: d.streak.current,
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

    if (d.streak.lastDay === day) return;
    d.streak.current = d.streak.lastDay === dayBefore(day) ? d.streak.current + 1 : 1;
    d.streak.lastDay = day;
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
    let answeredNow = 0;
    for (const entry of body.answers) {
      assertObject(entry);
      const id = assertId(entry.id, 'answers[].id');
      if (typeof entry.correct !== 'boolean') {
        throw new ValidationError('"answers[].correct" must be a boolean');
      }
      const rec = d.answers[id] ?? { correct: 0, wrong: 0, lastCorrect: false, last: '' };
      if (entry.correct) {
        rec.correct += 1;
        d.mistakes = d.mistakes.filter((m) => m !== id);
      } else {
        rec.wrong += 1;
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
      if (entries.length > MAX_IMPORT_ANSWERS) {
        throw new ValidationError(`"answers" holds more than ${MAX_IMPORT_ANSWERS} entries`);
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
        clean.answers[id] = {
          correct,
          wrong,
          lastCorrect: rec.lastCorrect,
          last: typeof rec.last === 'string' ? rec.last.slice(0, 40) : '',
        };
      }
    }

    if (body.exams !== undefined) {
      if (!Array.isArray(body.exams)) throw new ValidationError('"exams" must be an array');
      if (body.exams.length > MAX_IMPORT_EXAMS) {
        throw new ValidationError(`"exams" holds more than ${MAX_IMPORT_EXAMS} entries`);
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
      for (const [day, count] of Object.entries(body.dailyAnswers)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
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

    if (body.streak !== undefined) {
      assertObject(body.streak);
      const current = Number(body.streak.current);
      if (!Number.isInteger(current) || current < 0) {
        throw new ValidationError('"streak.current" must be a non-negative integer');
      }
      clean.streak = {
        current,
        lastDay: typeof body.streak.lastDay === 'string' ? body.streak.lastDay.slice(0, 10) : '',
      };
    }

    // Mistakes must stay consistent with the answers they refer to.
    clean.mistakes = clean.mistakes.filter((id) => clean.answers[id] && !clean.answers[id].lastCorrect);

    Object.assign(this.store.data, clean);
    await this.store.persist();
    return this.snapshot();
  }
}
