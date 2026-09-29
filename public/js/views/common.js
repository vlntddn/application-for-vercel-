// Shared helpers used by two or more screens. Extracted from views.js
// (Sprint 1, S1.2) — pure code move, no behavior change.
import { state, shuffle } from '../state.js';
import { el } from '../ui.js';
import { DAILY_GOAL_DEFAULT } from '../domain/progress.js';
import { queueOrder as domainQueueOrder, masteryOf as domainMasteryOf, categoryStats as domainCategoryStats } from '../domain/learning.js';

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
  return domainQueueOrder(questions, answers, count, Math.random);
}

/** Session queue: unseen questions first, then current mistakes, then the rest. */
export function pickQueue(questions, count) {
  return queueOrder(questions, state.progress.answers, count);
}

export function masteryOf(slug, count) {
  return domainMasteryOf(state.progress.answers, slug, count);
}

/**
 * Per-topic breakdown derived from the answer log (pure read, no
 * mutation). `attempted` = distinct questions tried; `accuracy` counts
 * every attempt (a question answered wrong then right is 50%), so it
 * measures reliability while `masteredPct` measures coverage.
 */
export function categoryStats() {
  return domainCategoryStats(state.progress.answers, state.manifest.categories);
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

/*
 * Install reminder (S2.8a4). The wipe risk it warns about: in standalone
 * mode progress lives in this browser, and Safari on iPhone/iPad erases
 * site data after ~7 days when the app is not on the Home Screen. Server
 * mode is out of scope — its progress.json is not touched by the browser.
 */
export const INSTALL_REMINDER_DISMISS_MS = 7 * 24 * 3600 * 1000;

/** iOS device in the user agent (iPhone/iPad/iPod). */
export function isIOSUserAgent(ua) {
  return typeof ua === 'string' && /iphone|ipad|ipod/i.test(ua);
}

/**
 * Pure decision (unit-testable without a browser): true only for an uninstalled
 * iPhone/iPad (not on the Home Screen) when "Not now" was not pressed within
 * 7 days. `isInstalled` is the iOS Home-Screen signal (navigator.standalone /
 * display-mode:standalone). The app's data-mode gate (server vs standalone)
 * lives in the view, not here — in server mode progress is not at risk.
 */
export function shouldSuggestInstallReminder(userAgent, isInstalled, dismissedAt, now) {
  if (!isIOSUserAgent(userAgent)) return false;
  if (isInstalled) return false;
  if (dismissedAt) {
    const t = new Date(dismissedAt).getTime();
    if (!Number.isNaN(t) && now - t < INSTALL_REMINDER_DISMISS_MS) return false;
  }
  return true;
}

export function readInstallDismissed() {
  try { return localStorage.getItem('pp-install-dismissed'); } catch { return null; }
}

export function writeInstallDismissed() {
  try { localStorage.setItem('pp-install-dismissed', new Date().toISOString()); } catch { /* private mode */ }
}

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

/** Owner's feedback address (2026-09-29). mailto: opens the user's own mail app —
 *  nothing is sent by Passo itself. */
export const FEEDBACK_EMAIL = 'hello@studiodudin.com';

/** mailto: link with a prefilled subject (and optional body). */
export function feedbackHref(subject, body = '') {
  const q = `subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
  return `mailto:${FEEDBACK_EMAIL}?${q}`;
}
