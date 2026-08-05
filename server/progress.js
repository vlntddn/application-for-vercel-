export const LANGUAGES = ['en', 'ru', 'zh'];
export const THEMES = ['light', 'dark'];

const NAME_MAX = 40;
const ID_MAX = 120;

export const EMPTY_PROGRESS = {
  profile: { name: '', language: 'en', theme: 'light', sound: true, onboarded: false },
  answers: {}, // questionId -> { correct, wrong, lastCorrect, last }
  mistakes: [], // questionIds currently answered wrong
  exams: [], // { date, total, errors, passed }
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

function today() {
  return new Date().toISOString().slice(0, 10);
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
    if (d.streak.lastDay === day) return;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    d.streak.current = d.streak.lastDay === yesterday ? d.streak.current + 1 : 1;
    d.streak.lastDay = day;
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
    }
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
}
