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

/** Accent-insensitive lowercase — "Purché" normalizes to "purch". */
function normalizeText(it) {
  return (it || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Does `word` (as written in signal-words.json) occur in `text`?
 *  Accent-folded word-boundary match: "mai" matches "Mai" but not
 *  "maimai"; the phrase "purché" matches "Purchè"/"Purché". */
export function hasSignalWord(text, word) {
  const pattern = normalizeText(word);
  const re = new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, 'g');
  re.lastIndex = 0;
  return re.test(normalizeText(text));
}

/**
 * Drill «Язык экзамена» (L1c) queue: `count` bank questions that contain a
 * signal word, ~50/50 between FALSO traps and VERO counter-examples, and
 * with as many distinct signal words as the pools allow (no two in a row
 * share a word). Each question is tagged `{ ...q, signalWord }`.
 * Returns fewer than `count` when the bank holds less — never pads.
 */
export function signalQueue(questions, insights, count = 20, rand = DEFAULT_RAND) {
  const words = (insights?.words || []).map((w) => w.word);
  const falseByWord = new Map();
  const trueByWord = new Map();
  for (const q of questions) {
    const word = words.find((w) => hasSignalWord(q.text_it, w));
    if (!word) continue;
    const pool = q.is_true ? trueByWord : falseByWord;
    if (!pool.has(word)) pool.set(word, []);
    pool.get(word).push(q);
  }
  const queue = [];
  let lastWord = null;
  for (let i = 0; i < count; i++) {
    // Alternate sides so the mix stays ~50/50; when one side is empty
    // take the other, still preferring a new word.
    const sides = i % 2 === 0
      ? [falseByWord, trueByWord]
      : [trueByWord, falseByWord];
    let chosen = null;
    for (const byWord of sides) {
      const candidates = [...byWord.entries()]
        .filter(([w]) => w !== lastWord)
        .map(([w, arr]) => [w, arr]);
      if (candidates.length) {
        const pick = shuffled(candidates, rand)[0][1].shift();
        if (pick) { chosen = pick; break; }
      }
    }
    if (!chosen) {
      // Allow a repeated word as a last resort, then any side.
      for (const byWord of sides) {
        const arr = [...byWord.values()].find((a) => a.length);
        if (arr) { chosen = arr.shift(); break; }
      }
    }
    if (!chosen) break;
    const word = words.find((w) => hasSignalWord(chosen.text_it, w));
    queue.push({ ...chosen, signalWord: word });
    lastWord = word;
  }
  return queue;
}

/**
 * L1c — разметка слов-сигналов в тексте вопроса (чистая, без DOM):
 * возвращает сегменты `{ text, mark }` — кусок текста и флаг «это слово-сигнал».
 * Подсвечивается самое первое вхождение; акценты игнорируются при поиске,
 * в сегментах — оригинальный текст.
 */
export function signalSpans(text, words) {
  if (!text || !words.length) return [{ text: text ?? '', mark: false }];
  const norm = (x) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const n = norm(text);
  if (n.length !== text.length) return [{ text, mark: false }];
  let best = null; // { start, end }
  for (const w of words) {
    const re = new RegExp(`(^|[^a-z0-9])${norm(w)}([^a-z0-9]|$)`, 'gi');
    const m = re.exec(n);
    if (m) {
      const start = m.index + (m[1] ? m[1].length : 0);
      const end = start + norm(w).length;
      if (!best || start < best.start) best = { start, end };
    }
  }
  if (!best) return [{ text, mark: false }];
  const segs = [];
  if (best.start) segs.push({ text: text.slice(0, best.start), mark: false });
  segs.push({ text: text.slice(best.start, best.end), mark: true });
  if (best.end < text.length) segs.push({ text: text.slice(best.end), mark: false });
  return segs;
}
