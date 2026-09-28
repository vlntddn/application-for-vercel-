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
