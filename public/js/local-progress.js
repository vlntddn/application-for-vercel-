import { ProgressService, EMPTY_PROGRESS } from './domain/progress.js';

/**
 * Standalone mode: the app runs from static hosting with no backend, so
 * progress lives in this browser instead of progress.json on a server.
 *
 * The rules are NOT reimplemented here — the very same ProgressService
 * that the Node server uses runs against a localStorage-backed store, so
 * validation and bookkeeping cannot drift between the two modes.
 */

const KEY = 'pp-progress';

class LocalStore {
  constructor() {
    this.data = this.#read();
  }

  #read() {
    const empty = structuredClone(EMPTY_PROGRESS);
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(KEY));
    } catch {
      return empty;
    }
    if (!saved || typeof saved !== 'object') return empty;
    // Merge so a snapshot written by an older version keeps working.
    return {
      ...empty,
      ...saved,
      profile: { ...empty.profile, ...(saved.profile || {}) },
      streak: { ...empty.streak, ...(saved.streak || {}) },
    };
  }

  async persist() {
    const { stats, ...data } = this.data; // stats are derived, never stored
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  async reset() {
    this.data = structuredClone(EMPTY_PROGRESS);
    localStorage.removeItem(KEY);
  }
}

const service = new ProgressService(new LocalStore());

/**
 * Same surface as the progress half of `api`, so the rest of the app
 * cannot tell which mode it is running in.
 */
export const localProgressApi = {
  progress: async () => service.snapshot(),
  updateProfile: async (profile) => ({ profile: await service.updateProfile(profile) }),
  recordAnswers: async (answers) => service.recordAnswers({ answers }),
  recordExam: async (exam) => ({ exam: await service.recordExam(exam) }),
  markTheoryRead: async (chapterId) => service.markTheoryRead({ chapterId }),
  importProgress: async (data) => service.importProgress(data),
  resetProgress: async () => service.reset(),
};
