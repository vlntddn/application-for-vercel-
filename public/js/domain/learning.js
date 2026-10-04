// Learning domain logic (Sprint L, L0) — pure functions, no global `state`.
// Runs in browser and Node 18+ (tests). Randomness is injected via `rand`
// (a 0..1 function) so order-dependent tests stay deterministic.

// L5a — chapter→topic mapping (pure data, no view imports), used by
// learningPath() below.
import { CHAPTER_CATEGORY } from '../theory-map.js';

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

// L7 — exam readiness model. Defaults mirror the mock exam constants.
export const EXAM_QUESTIONS = 30;
export const EXAM_MAX_ERRORS = 3;
export const EXAM_READINESS_MIN_ANSWERS = 150;

/** P(X ≤ k) for X ~ Binomial(n, p) — cumulative binomial. */
function binomLEq(n, k, p) {
  if (p <= 0) return 1;
  if (p >= 1) return k >= n ? 1 : 0;
  const q = 1 - p;
  let sum = 0;
  let c = 1;
  for (let i = 0; i <= Math.min(k, n); i++) {
    c = i === 0 ? 1 : c * ((n - i + 1) / i);
    sum += c * Math.pow(p, i) * Math.pow(q, n - i);
  }
  return sum;
}

/**
 * Pass-chance estimate from the learner's own answers.
 *
 * Per-topic error rate = (wrong + 1) / (attempts + 2) (Laplace smoothing, so
 * untried questions count as mistakes). The ticket is proportional to topic
 * sizes (same as shuffling the whole bank), so the per-question error rate is
 * the size-weighted mean, and P(≤ 3 of 30 wrong) is binomial over it.
 *
 * `attempts` = distinct questions tried. Returns `{ ready: false, answers,
 * needed }` below EXAM_READINESS_MIN_ANSWERS, otherwise `{ ready: true,
 * passPct, biggestGain: { slug, name, gainPct } | null }` — the topic whose
 * improvement to 90% mastery lifts the estimate the most (gain ≥ 1 pt).
 */
export function examReadiness(answers, categories, { minAnswers = EXAM_READINESS_MIN_ANSWERS } = {}) {
  const entries = Object.entries(answers || {});
  const totalAnswers = entries.length;
  if (totalAnswers < minAnswers) {
    return { ready: false, answers: totalAnswers, needed: minAnswers };
  }

  const total = categories.reduce((s, c) => s + c.count, 0) || 1;
  const compute = (fix) => {
    let p = 0;
    for (const cat of categories) {
      let attempts = 0;
      let wrong = 0;
      for (const [id, a] of entries) {
        if (!id.startsWith(`${cat.slug}-`)) continue;
        attempts += 1;
        wrong += a.wrong;
      }
      const r = fix?.[cat.slug] ?? (wrong + 1) / (attempts + 2);
      p += r * (cat.count / total);
    }
    return p;
  };

  const passPct = Math.round(binomLEq(EXAM_QUESTIONS, EXAM_MAX_ERRORS, compute()) * 100);

  // Biggest gain: which topic, improved to 90% mastery (error 0.1), moves
  // the estimate the most?
  const MASTERY_TARGET = 0.1;
  let best = null;
  for (const cat of categories) {
    const fix = { [cat.slug]: MASTERY_TARGET };
    const p2 = compute(fix);
    const gain = Math.round(binomLEq(EXAM_QUESTIONS, EXAM_MAX_ERRORS, p2) * 100) - passPct;
    if (gain >= 1 && (!best || gain > best.gainPct)) {
      best = { slug: cat.slug, name: cat.name, gainPct: gain };
    }
  }

  return { ready: true, passPct, biggestGain: best };
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

// L8 — «Слово по тапу»: dictionary words in a question's `text_it` become
// tappable; tapping opens a callout with the translation in the learner's
// language. Matching is by lemma: the leading article and any parenthetical
// gloss ("l'incidente (stradale)") are stripped, and apostrophes are treated
// as word boundaries ("l'incrocio" in the question matches "incrocio").
const ARTICLE_RE = /^(?:l'|(?:la|il|lo|le|gli)\s+)/i;

/** Lemma of a dictionary term: no article, no "(…)" gloss, lowercase.
 *  "la carreggiata" → "carreggiata"; "l'incidente (stradale)" → "incidente". */
export function termLemma(term) {
  let l = (term || '').trim();
  const m = /\(.*\)$/.exec(l);
  if (m) l = l.slice(0, m.index);
  l = l.replace(ARTICLE_RE, '').trim().toLowerCase();
  return l.replace(/\s+/g, ' ').trim();
}

/**
 * Build a flat lookup of dictionary terms for `text_it` matching.
 *
 * @param {object[]} sections - `data/dictionary.json → sections`; each has
 *   `terms: [{ it, en, ru, zh }, …]`.
 * @returns {object[]} `[{ lemma, term, words }]` sorted by lemma length
 *   (longest first) so "doppio senso" wins over a single word "senso".
 */
export function buildDictionaryTapIndex(sections) {
  const index = [];
  for (const sec of sections || []) {
    for (const t of sec.terms || []) {
      const lemma = termLemma(t.it);
      if (!lemma) continue;
      index.push({ lemma, term: t, words: lemma.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
    }
  }
  index.sort((a, b) => b.lemma.length - a.lemma.length);
  return index;
}

/**
 * Find every dictionary term (by lemma) that occurs in `text` as a whole
 * word, accent-insensitively. Apostrophes count as word boundaries, so the
 * contracted form "l'incrocio" matches the lemma "incrocio"; multi-word
 * lemmas may have a hyphen in the question instead of a space. Overlapping
 * spans are dropped (longer terms win — the index is longest-first).
 *
 * @returns {object[]} `[{ term, start, end }]` sorted by `start`, where
 *   `start`/`end` span the matched lemma text in `text`. Empty when no term
 *   occurs.
 */
export function dictionaryTapTerms(text, index) {
  if (!text || !index || !index.length) return [];
  // The fold is length-preserving, so offsets map 1:1 back to `text`.
  const n = normalizeText(text);
  const hits = [];
  for (const { lemma, term, words } of index) {
    const re = new RegExp(`(^|[^a-z0-9])${words.join(`(?:'\\s*|\\s+|(?<=\\w)-)`)}($|[^a-z0-9])`, 'g');
    let m;
    while ((m = re.exec(n))) {
      const start = m.index + (m[1] ? m[1].length : 0);
      const end = start + lemma.length;
      if (hits.some((h) => start < h.end && end > h.start)) {
        re.lastIndex = m.index + 1;
        continue;
      }
      hits.push({ term, start, end });
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  return hits;
}

/** First dictionary term in `text` (by lemma) — or `null` (see `dictionaryTapTerms`). */
export function dictionaryTapTerm(text, index) {
  return dictionaryTapTerms(text, index)[0] ?? null;
}


/** Total answers recorded (correct + wrong across all question records). */
export function attemptedCount(answers) {
  let n = 0;
  for (const a of Object.values(answers || {})) {
    n += (a?.correct ?? 0) + (a?.wrong ?? 0);
  }
  return n;
}

// «auto» switches the hints off once the learner has answered this many
// questions — the highlight is an on-ramp, not a crutch (owner's call, L2).
export const SIGNAL_HINTS_AUTO_LIMIT = 100;

/**
 * L2 — should signal words be highlighted? `profile.signalHints` is
 * `auto` | `on` | `off`; anything else (missing/legacy value) behaves as
 * `auto`: on while the learner has answered fewer than 100 questions.
 */
export function signalHintsEnabled(profile, answers) {
  const mode = profile?.signalHints;
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return attemptedCount(answers) < SIGNAL_HINTS_AUTO_LIMIT;
}

/**
 * First signal word (as written in signal-words.json) that occurs in the
 * text — accent-insensitive word-boundary match. null when none.
 */
export function findSignalWord(text, words) {
  if (!text || !words?.length) return null;
  return words.find((w) => hasSignalWord(text, w.word ?? w)) ?? null;
}

/**
 * L2 — glossary for the tap callout: one entry per bank signal word with
 * a translation (en/ru/zh) from the exam-Italian lesson. A lesson entry
 * that covers a pair ("solo / soltanto") is mapped to both spellings.
 * Words without a lesson entry are kept without a `gloss`.
 */
export function signalGlossary(lessons, insights) {
  const examItalian = lessons?.examItalian;
  if (!examItalian?.sections) return [];
  const byKey = new Map();
  for (const section of examItalian.sections) {
    for (const entry of section.entries || []) {
      if (!entry.it || !entry.gloss) continue;
      for (const variant of entry.it.split('/').map((s) => s.trim()).filter(Boolean)) {
        if (!byKey.has(variant)) byKey.set(variant, entry.gloss);
      }
    }
  }
  const out = [];
  for (const w of insights?.words || []) {
    const key = (w.word || '').split('/').map((s) => s.trim()).filter(Boolean).find((k) => byKey.has(k));
    out.push({ word: w.word, questions: w.questions, falseRatio: w.falseRatio, gloss: key ? byKey.get(key) : null });
  }
  return out;
}

/**
 * L3 — why the learner keeps missing a question. For every CURRENT mistake
 * (answered, last answer wrong) the causes: `signal` (a signal word occurs
 * in the text), `sign` (the question carries an image), `number` (the text
 * contains a digit) — several may apply. A mistake with none of the three
 * specific causes is a plain `rule` mistake (road-rule knowledge).
 * Returns `{ perQuestion: [{ questionId, causes }], counts }` where counts
 * tallies each cause across all mistakes.
 */
export function mistakeCauses(answers, questions, insights, lessons) {
  const words = (insights?.words || []).map((w) => w.word).filter(Boolean);
  const perQuestion = (questions || [])
    .filter((q) => {
      const a = answers?.[q.id];
      return !!a && !a.lastCorrect;
    })
    .map((q) => {
      const causes = [];
      if (words.length && findSignalWord(q.text_it, words)) causes.push('signal');
      if (q.image_url) causes.push('sign');
      if (/\d/.test(q.text_it || '')) causes.push('number');
      if (causes.length === 0) causes.push('rule');
      return { questionId: q.id, causes };
    });
  const counts = { signal: 0, sign: 0, number: 0, rule: 0 };
  for (const { causes } of perQuestion) for (const c of causes) counts[c] += 1;
  return { perQuestion, counts };
}

/** Escape special RegExp characters inside a number token. */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * L4 — does the text contain the number token? Digit-boundary guards:
 * "50" matches "50 km/h" but not "150" or "500", "0,5" does not match
 * "0,50". Letters never matter (a number is a number).
 */
export function hasNumber(text, token) {
  if (!text || !token) return false;
  const re = new RegExp(`(^|[^0-9])${escapeRe(token)}([^0-9]|$)`);
  return re.test(text);
}

/**
 * L4 — «Числа, которые надо знать» drill queue: `count` bank questions
 * that contain at least one known number, ~50/50 between FALSO traps and
 * VERO counter-examples, as many distinct numbers as the pools allow
 * (the L1c signalQueue idea). Each question is tagged
 * `{ ...q, number }` with the first matched token.
 * Returns fewer than `count` when the bank holds less — never pads.
 */
export function numbersQueue(questions, numbersData, count = 20, rand = DEFAULT_RAND) {
  const tokens = (numbersData?.tokens || []).map((t) => t.token);
  const falseByToken = new Map();
  const trueByToken = new Map();
  for (const q of questions) {
    const token = tokens.find((t) => hasNumber(q.text_it, t));
    if (!token) continue;
    const pool = q.is_true ? trueByToken : falseByToken;
    if (!pool.has(token)) pool.set(token, []);
    pool.get(token).push(q);
  }
  const queue = [];
  let lastToken = null;
  for (let i = 0; i < count; i++) {
    const sides = i % 2 === 0
      ? [falseByToken, trueByToken]
      : [trueByToken, falseByToken];
    let chosen = null;
    for (const byToken of sides) {
      const candidates = [...byToken.entries()]
        .filter(([t]) => t !== lastToken)
        .map(([t, arr]) => [t, arr]);
      if (candidates.length) {
        const pick = shuffled(candidates, rand)[0][1].shift();
        if (pick) { chosen = pick; break; }
      }
    }
    if (!chosen) {
      // Allow a repeated number as a last resort, then any side.
      for (const byToken of sides) {
        const arr = [...byToken.values()].find((a) => a.length);
        if (arr) { chosen = arr.shift(); break; }
      }
    }
    if (!chosen) break;
    const token = tokens.find((t) => hasNumber(chosen.text_it, t));
    queue.push({ ...chosen, number: token });
    lastToken = token;
  }
  return queue;
}

/**
 * L4 — разметка числа в тексте вопроса (чистая, без DOM): сегменты
 * `{ text, mark }`, подсвечивается самое первое вхождение числа из списка.
 */
export function numberSpans(text, tokens) {
  if (!text || !tokens?.length) return [{ text: text ?? '', mark: false }];
  let best = null; // { start, end }
  for (const t of tokens) {
    const re = new RegExp(`(^|[^0-9])${escapeRe(t)}([^0-9]|$)`);
    const m = re.exec(text);
    if (!m) continue;
    const start = m.index + (m[1] ? m[1].length : 0);
    const end = start + t.length;
    if (!best || start < best.start) best = { start, end };
  }
  if (!best) return [{ text, mark: false }];
  const segs = [];
  if (best.start) segs.push({ text: text.slice(0, best.start), mark: false });
  segs.push({ text: text.slice(best.start, best.end), mark: true });
  if (best.end < text.length) segs.push({ text: text.slice(best.end), mark: false });
  return segs;
}


/**
 * Recommended order of the learning path. First eight groups follow the
 * exam's core sequence (definitions → danger/prohibition/obligation signs →
 * priority → markings → traffic lights → speed/distance → overtaking →
 * stopping); everything not listed here comes after, chapter number order.
 */
export const PATH_ORDER = [
  'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8', 'ch9',
  'ch12', 'ch13',
];

/** Self-check quiz passes the path step at 4 of 5. */
export const PATH_MINI_PASS = 4;
/** The chapter self-check always shows this many questions (theory.js). */
export const PATH_CHECK_QUESTIONS = 5;
/** Topic mastery counts as "done" from 80% of the bank. */
export const PATH_MASTERY_PCT = 80;

function orderedChapters(lessons) {
  const all = Object.keys(lessons?.chapters || {});
  const rest = all
    .filter((id) => !PATH_ORDER.includes(id))
    .sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
  return [...PATH_ORDER.filter((id) => all.includes(id)), ...rest];
}

/**
 * L5a — the learning path as a flat list of steps, one per chapter, in
 * recommended order. Per step:
 * - `read` — the lesson is marked read (`progress.theoryRead`);
 * - `check` — the chapter's self-check quiz last passed with at least 4/5
 *   (`progress.chapters[id] = { check: N }`);
 * - `masteryPct` — coverage of the linked topic's bank
 *   (last-correct answers / bank count, `masteryOf` semantics);
 * - `status` — 'done' when any of read/check/mastery holds (soft: nothing
 *   is blocked), 'ready' for the first not-done step, 'open' otherwise.
 * `ready` is true while every step is done (exam ready).
 */
export function learningPath(progress, manifest, lessons) {
  const steps = orderedChapters(lessons).map((id) => {
    const slug = CHAPTER_CATEGORY[id];
    const cat = (manifest?.categories || []).find((c) => c.slug === slug) || null;
    const m = masteryOf(progress?.answers || {}, slug, cat?.count || 0);
    const read = (progress?.theoryRead || []).includes(id);
    const check = progress?.chapters?.[id]?.check || 0;
    // Exact (unrounded) 80% threshold: at 531 questions, 424/531 is
    // 79.85% → not done, even though the rounded display says "80%".
    const masteryDone = cat?.count ? m.mastered * 100 >= PATH_MASTERY_PCT * cat.count : false;
    const done = read || check >= PATH_MINI_PASS || masteryDone;
    return {
      id,
      chapter: Number(id.slice(3)),
      slug,
      name: cat?.name || id,
      read,
      check,
      mastered: m.mastered,
      masteryPct: m.pct,
      done,
      // status assigned below: only the first not-done step is 'ready'
      status: done ? 'done' : 'open',
    };
  });
  const current = steps.find((s) => !s.done) || null;
  if (current) current.status = 'ready';
  // No chapters (lessons failed to load or came back empty) is NOT «all done»:
  // that read as «You finished the whole 0-step path» on a brand-new profile.
  const empty = steps.length === 0;
  return {
    steps,
    currentIndex: current ? steps.indexOf(current) : -1,
    ready: !empty && current === null,
    empty,
  };
}

/**
 * L5b — what the learner does next in a step. Order Read → Check → Practice:
 * the first missing part of the step wins. A step that has a read lesson
 * and a passed check (or a topic without a bank) lands on 'practice'.
 * Returns null when the step has no question bank to practice against.
 */
export function nextStepAction(step) {
  if (!step) return null;
  if (!step.read) return 'read';
  if (step.check < PATH_MINI_PASS) return 'check';
  return step.slug ? 'practice' : null;
}

