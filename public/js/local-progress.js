import { ProgressService, EMPTY_PROGRESS, migrateProgress } from './domain/progress.js';

/**
 * Standalone mode: the app runs from static hosting with no backend, so
 * progress lives in this browser instead of progress.json on a server.
 *
 * The rules are NOT reimplemented here — the very same ProgressService
 * that the Node server uses runs against a localStorage-backed store, so
 * validation and bookkeeping cannot drift between the two modes.
 *
 * Surviving an update of the site is the whole point of this file:
 * localStorage outlives a deploy, and migrateProgress() translates a
 * snapshot written by any older version into the current shape.
 */

const KEY = 'pp-progress';
const BACKUP_KEY = 'pp-progress.backup';

class LocalStore {
  constructor() {
    this.data = this.#read();
  }

  #read() {
    const stored = this.#readKey(KEY);
    if (stored) {
      // Refresh the safety copy on every successful load, so a snapshot is
      // protected from the first visit rather than only after a write.
      try {
        localStorage.setItem(BACKUP_KEY, JSON.stringify(stored));
      } catch {
        /* not fatal: the main copy is fine */
      }
      return stored;
    }

    // The main copy was unreadable. Before giving up, try the rolling
    // backup written after the previous successful save.
    const backup = this.#readKey(BACKUP_KEY);
    if (backup) {
      console.warn('Passo: main snapshot unreadable, recovered the backup copy');
      // Heal straight away, so the damaged value is not re-read (and
      // re-quarantined) on every future visit.
      try {
        localStorage.setItem(KEY, JSON.stringify(backup));
      } catch {
        /* the in-memory copy is still correct for this session */
      }
      return backup;
    }
    return structuredClone(EMPTY_PROGRESS);
  }

  #readKey(key) {
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return null; // storage blocked entirely (private mode, policy)
    }
    if (!raw) return null;
    try {
      return migrateProgress(JSON.parse(raw));
    } catch {
      // Damaged JSON is kept aside rather than thrown away: study history
      // is irreplaceable, and a copy leaves a chance to recover it by hand.
      this.#quarantine(key, raw);
      return null;
    }
  }

  #quarantine(key, raw) {
    try {
      localStorage.setItem(`${key}.corrupt.${Date.now()}`, raw);
      console.error(`Passo: could not parse ${key}; kept a copy under ${key}.corrupt.*`);
    } catch {
      /* nothing more we can do; never let this break startup */
    }
  }

  async persist() {
    const { stats, ...data } = this.data; // stats are derived, never stored
    const json = JSON.stringify(data);
    try {
      // Keep the previous good value as a backup before overwriting, so a
      // write that fails halfway cannot leave the user with nothing.
      const previous = localStorage.getItem(KEY);
      if (previous) localStorage.setItem(BACKUP_KEY, previous);
      localStorage.setItem(KEY, json);
    } catch (err) {
      // Out of quota, or storage blocked. The in-memory snapshot is still
      // correct for this session; tell the console rather than crash the UI.
      console.error('Passo: could not save progress to this browser', err);
    }
  }

  async reset() {
    this.data = structuredClone(EMPTY_PROGRESS);
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(BACKUP_KEY);
    } catch {
      /* ignore */
    }
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

/**
 * Asks the browser to keep this data even under storage pressure. Without
 * it, iOS clears script-writable storage after seven idle days for sites
 * that were never added to the Home Screen — which would quietly wipe a
 * study history. Installed apps are exempt, and this makes it explicit.
 */
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return { supported: false, persisted: false };
    const already = await navigator.storage.persisted();
    const persisted = already || (await navigator.storage.persist());
    return { supported: true, persisted };
  } catch {
    return { supported: false, persisted: false };
  }
}
