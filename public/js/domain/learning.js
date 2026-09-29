// Learning domain logic (Sprint L, L0) — pure functions, no global `state`.
// Runs in browser and Node 18+ (tests). Randomness is injected via `rand`
// (a 0..1 function) so order-dependent tests stay deterministic.

const DEFAULT_RAND = Math.random;

/** Fisher–Yates shuffle (new array) driven by the injected `rand`. */
export function shuffled(list, rand = DEFAULT_RAND) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Session queue order: unseen first, then current mistakes, then the rest.
 * `answers` maps question id → record with `lastCorrect`/`correct`/`wrong`.
 */
export function queueOrder(questions, answers, count, rand = DEFAULT_RAND) {
  const unseen = questions.filter((q) => !answers[q.id]);
  const wrong = questions.filter((q) => answers[q.id] && !answers[q.id].lastCorrect);
  const rest = questions.filter((q) => answers[q.id]?.lastCorrect);
  return [...shuffled(unseen, rand), ...shuffled(wrong, rand), ...shuffled(rest, rand)].slice(0, count);
}

/**
 * Mastery for one topic: only ids prefixed with `slug-` count, so
 * `segnali` never includes `segnali-divieto` / `segnali-pericolo` answers.
 */
export function masteryOf(answers, slug, count) {
  const mastered = Object.entries(answers)
    .filter(([id, a]) => a.lastCorrect && id.startsWith(`${slug}-`)).length;
  return { mastered, pct: count ? Math.round((mastered / count) * 100) : 0 };
}

/**
 * Per-topic breakdown derived from the answer log. `attempted` = distinct
 * questions tried; `accuracy` counts every attempt (wrong-then-right = 50%);
 * `masteredPct` = coverage of last-correct ids within the topic's bank size.
 * `categories` = manifest categories (`{slug, name, count}`).
 */
export function categoryStats(answers, categories) {
  const entries = Object.entries(answers);
  return categories.map((cat) => {
    let correct = 0;
    let wrong = 0;
    let attempted = 0;
    let mastered = 0;
    for (const [id, a] of entries) {
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
      masteredPct: cat.count ? Math.round((mastered / cat.count) * 100) : 0,
      accuracy: total ? Math.round((correct / total) * 100) : null,
    };
  });
}

// Defaults for the intro on-ramp (kept here so the view wrapper is thin).
export const INTRO_QUESTIONS = 5;
export const INTRO_TEXT_LEN = 120;

/**
 * First-session queue: the topic's easiest questions (short Italian, no sign
 * image, unseen) first, then the rest of the batch in unseen→wrong→kept order.
 * Returns null when the topic holds fewer than `count` easy questions — the
 * caller falls back to the regular queue and never pads with questions
 * stolen from other topics.
 */
export function introQueue(questions, { answers = {}, batch = 20, count = INTRO_QUESTIONS, textLen = INTRO_TEXT_LEN, rand = DEFAULT_RAND } = {}) {
  const easy = shuffled(questions.filter(
    (q) => !q.image_url && (q.text_it || '').length <= textLen && !answers[q.id],
  ), rand);
  if (easy.length < count) return null;
  const intro = easy.slice(0, count);
  const introIds = new Set(intro.map((q) => q.id));
  return [...intro, ...queueOrder(questions.filter((q) => !introIds.has(q.id)), answers, batch - count, rand)];
}
