// Shared helpers used by two or more screens. Extracted from views.js
// (Sprint 1, S1.2) — pure code move, no behavior change.
import { state, shuffle } from '../state.js';
import { el } from '../ui.js';
import { DAILY_GOAL_DEFAULT } from '../domain/progress.js';

/** Size of one practice batch (dashboard hint, practice queue, search practice). */
export const PRACTICE_BATCH = 20;

/** The user's goal from the profile, with the default as a safety net. */
export function dailyGoal() {
  const goal = state.progress.profile?.dailyGoal;
  return Number.isInteger(goal) ? goal : DAILY_GOAL_DEFAULT;
}

export function errorBanner(err) {
  return el('p.error-banner', { role: 'alert' }, err.message.toUpperCase());
}

export function lang() {
  return state.progress.profile.language || 'en';
}

export function translationOf(question) {
  return question.translations?.[lang()]?.text || '';
}

/** Picks the user's language from a {en,ru,zh} object, falling back to EN. */
export function loc(obj) {
  return obj?.[lang()] || obj?.en || '';
}

/** Session queue order: unseen first, then current mistakes, then the rest. */
export function queueOrder(questions, answers, count) {
  const unseen = questions.filter((q) => !answers[q.id]);
  const wrong = questions.filter((q) => answers[q.id] && !answers[q.id].lastCorrect);
  const rest = questions.filter((q) => answers[q.id]?.lastCorrect);
  return [...shuffle(unseen), ...shuffle(wrong), ...shuffle(rest)].slice(0, count);
}

/** Session queue: unseen questions first, then current mistakes, then the rest. */
export function pickQueue(questions, count) {
  return queueOrder(questions, state.progress.answers, count);
}

export function masteryOf(slug, count) {
  const mastered = Object.entries(state.progress.answers)
    .filter(([id, a]) => a.lastCorrect && id.startsWith(`${slug}-`)).length;
  return { mastered, pct: Math.round((mastered / count) * 100) };
}

/**
 * Per-topic breakdown derived from the answer log (pure read, no
 * mutation). `attempted` = distinct questions tried; `accuracy` counts
 * every attempt (a question answered wrong then right is 50%), so it
 * measures reliability while `masteredPct` measures coverage.
 */
export function categoryStats() {
  const answers = Object.entries(state.progress.answers);
  return state.manifest.categories.map((cat) => {
    let correct = 0;
    let wrong = 0;
    let attempted = 0;
    let mastered = 0;
    for (const [id, a] of answers) {
      if (!id.startsWith(`${cat.slug}-`)) continue;
      attempted += 1;
      correct += a.correct;
      wrong += a.wrong;
      if (a.lastCorrect) mastered += 1;
    }
    const total = correct + wrong;
    return {
      slug: cat.slug,
      name: cat.name,
      count: cat.count,
      attempted,
      mastered,
      masteredPct: Math.round((mastered / cat.count) * 100),
      accuracy: total ? Math.round((correct / total) * 100) : null,
    };
  });
}

/**
 * Renders the translation area: hidden behind a button by default so the
 * user engages with the Italian original first (the exam has no translations).
 */
export function translationArea(translation, revealed, onReveal) {
  if (!translation) return null;
  if (revealed) return el('div.question-translation', {}, translation);
  return el('button.btn.btn-small.btn-translate', { onclick: onReveal },
    `TRANSLATE (${lang().toUpperCase()})`);
}

/** Last export date — UI metadata, not progress; localStorage, try/catch. */
export function readLastBackup() {
  try { return localStorage.getItem('pp-last-backup'); } catch { return null; }
}
export function writeLastBackup(iso) {
  try { localStorage.setItem('pp-last-backup', iso); } catch { /* private mode */ }
}

/** "Not now" on the home backup reminder: hidden for a week (try/catch). */
export function readBackupDismissed() {
  try { return localStorage.getItem('pp-backup-dismissed'); } catch { return null; }
}
export function writeBackupDismissed() {
  try { localStorage.setItem('pp-backup-dismissed', new Date().toISOString()); } catch { /* private mode */ }
}

/**
 * Downloads the whole progress snapshot as a dated JSON backup and records
 * the export time. Returns the ISO timestamp of the export.
 */
export function exportProgressSnapshot() {
  const backup = {
    app: 'patente-pro',
    exportedAt: new Date().toISOString(),
    ...state.progress,
  };
  delete backup.stats; // derived on the server, not part of the data
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
  );
  const link = el('a', {
    href: url,
    download: `patente-pro-backup-${backup.exportedAt.slice(0, 10)}.json`,
  });
  link.click();
  URL.revokeObjectURL(url);
  writeLastBackup(backup.exportedAt);
  return backup.exportedAt;
}

const BACKUP_MIN_ANSWERS = 50;
const BACKUP_STALE_MS = 14 * 24 * 60 * 60 * 1000;
const BACKUP_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Decide whether the home screen should nudge a backup export (S2.8a3).
 * Pure: all inputs by argument, `now` (ms) injected for testability.
 * Suggest when the user has ≥50 answers and the last backup is older than
 * 14 days (or never made), unless "Not now" was tapped within 7 days.
 */
export function shouldSuggestBackup(stats, lastBackupAt, dismissedAt, now) {
  const answered = stats?.answered ?? 0;
  if (answered < BACKUP_MIN_ANSWERS) return false;
  if (lastBackupAt) {
    const age = now - Date.parse(lastBackupAt);
    if (Number.isFinite(age) && age < BACKUP_STALE_MS) return false;
  }
  if (dismissedAt) {
    const since = now - Date.parse(dismissedAt);
    if (Number.isFinite(since) && since < BACKUP_DISMISS_MS) return false;
  }
  return true;
}
