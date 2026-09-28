import { api } from './api.js';
import {
  state,
  applyTheme,
  loadTheory,
  loadDictionary,
  loadLessons,
  loadQuestions,
  loadAllQuestions,
  slugForQuestionId,
  shuffle,
  recordAnswersResilient,
  recordExamResilient,
} from './state.js';
import { el, clear, fmtTime, fmtDate, titleCase } from './ui.js';
import { CHAPTER_CATEGORY, CATEGORY_CHAPTER } from './theory-map.js';
import { playCorrect, playWrong } from './sound.js';

import { dailyGoal, errorBanner, lang, translationOf, loc, queueOrder, pickQueue, masteryOf, categoryStats, translationArea, PRACTICE_BATCH } from './views/common.js';

const EXAM_QUESTIONS = 30;
const EXAM_SECONDS = 20 * 60;
const EXAM_MAX_ERRORS = 3;
// First-session on-ramp (Phase 2.2): a newcomer's first practice run opens
// with the topic's easiest questions — short text, no sign image — so the
// VERO/FALSO mechanic is felt before the hard wording starts.
const INTRO_QUESTIONS = 5;
const INTRO_TEXT_LEN = 120;

/**
 * First-session queue (Phase 2.2 "guaranteed first success").
 * A brand-new user opens on the topic's easiest questions — short Italian
 * (≤ INTRO_TEXT_LEN chars), no sign image, unseen — so the VERO/FALSO
 * mechanic is felt before the hard wording starts. Returns null when the
 * topic holds fewer than `count` such questions (image-heavy sign topics):
 * the caller then falls back to the regular queue and never pads with easy
 * questions stolen from other topics.
 *
 * Takes the topic's full question list (not a pre-sliced batch) and returns
 * the whole practice queue: the intro block first, then the rest of the
 * batch in the regular unseen→wrong→kept order.
 */
export function introQueue(questions, { answers = {}, batch = PRACTICE_BATCH, count = INTRO_QUESTIONS, textLen = INTRO_TEXT_LEN } = {}) {
  const easy = shuffle(questions.filter(
    (q) => !q.image_url && (q.text_it || '').length <= textLen && !answers[q.id],
  ));
  if (easy.length < count) return null;
  const intro = easy.slice(0, count);
  const introIds = new Set(intro.map((q) => q.id));
  return [...intro, ...queueOrder(questions.filter((q) => !introIds.has(q.id)), answers, batch - count)];
}

/* ============================== ONBOARDING ================ */
export { renderOnboarding } from './views/onboarding.js';

/* ============================== DASHBOARD ============================== */
export { renderDashboard } from './views/dashboard.js';


/* ============================== THEORY ============================== */
export { renderTheoryList, renderTheoryChapter, renderExamItalian } from './views/theory.js';

/* ============================== PRACTICE ============================== */

export function renderPracticeList(root) {
  const answers = state.progress.answers;
  clear(root,
    el('h1', {}, 'PRACTICE'),
    el('p.lede', {}, 'PICK A TOPIC. UNSEEN AND WRONG QUESTIONS COME FIRST.'),
    el('div.actions', { style: 'margin-bottom:20px' },
      el('a.btn', { href: '#/search' }, '🔍 SEARCH ALL QUESTIONS'),
    ),
    el('div.grid.grid-2', {},
      ...state.manifest.categories.map((cat) => {
        const mastered = Object.entries(answers)
          .filter(([id, a]) => a.lastCorrect && id.startsWith(`${cat.slug}-`)).length;
        const pct = Math.round((mastered / cat.count) * 100);
        return el('a.card', { href: `#/practice/${cat.slug}` },
          el('h2', {}, titleCase(cat.name)),
          el('p.stat-sub', {}, `${mastered}/${cat.count} MASTERED (${pct}%)`),
          el('div.bar', { 'aria-hidden': 'true' }, el('div', { style: `width:${pct}%` })),
        );
      }),
    ),
  );
}

/** Practice session over a queue of questions with instant feedback. */
/**
 * Explains a missed question using the lesson we authored for its
 * chapter. The bank's own `explanation` field is empty for almost every
 * question, so instead of inventing text we surface the chapter's
 * must-know facts — short, factual and exactly what the miss was about.
 */
function whyBlock(question, onNavigate) {
  const slug = slugForQuestionId(question.id);
  const chapterId = slug ? CATEGORY_CHAPTER[slug] : null;
  if (!chapterId) return null;

  const box = el('div.why-box', {});
  const button = el('button.btn.btn-small.btn-why', { onclick: open }, 'WHY? — KEY FACTS');
  box.append(button);

  async function open() {
    button.disabled = true;
    let lesson;
    try {
      lesson = (await loadLessons()).chapters?.[chapterId];
    } catch {
      lesson = null;
    }
    if (!lesson) {
      // No lesson for this chapter yet: send the reader to the theory.
      box.replaceChildren(el('a.btn.btn-small', {
        href: `#/theory/${chapterId}`, onclick: () => onNavigate?.(),
      }, 'READ THE CHAPTER →'));
      return;
    }
    box.replaceChildren(
      el('p.why-objective', {}, loc(lesson.objective)),
      ...(lesson.mustKnow || []).slice(0, 4).map((fact) =>
        el('div.why-fact', {},
          el('strong', {}, fact.fact_it),
          el('span.tag.must-value', {}, fact.value.toUpperCase()),
        ),
      ),
      el('a.btn.btn-small', {
        href: `#/theory/${chapterId}`, onclick: () => onNavigate?.(),
      }, 'FULL LESSON →'),
    );
  }

  return box;
}

export function renderQuizSession(root, questions, { title, backHash, onFinish, onQuit, easyStart }) {
  let index = 0;
  let correctCount = 0;
  let answered = false;
  let lastCorrect = null;
  let revealed = false; // translation visibility, reset per question
  let offline = false; // answers are queuing locally

  function reveal() {
    revealed = true;
    draw();
  }

  function keyHandler(e) {
    const key = e.key.toLowerCase();
    if (key === 't') return reveal();
    if (!answered) {
      if (key === 'v' || key === 'arrowleft') answer(true);
      if (key === 'f' || key === 'arrowright') answer(false);
    } else if (key === 'enter' || key === ' ') {
      e.preventDefault();
      next();
    }
  }
  document.addEventListener('keydown', keyHandler);
  // Leaving the page (nav links, QUIT) must detach the session's key handler.
  window.addEventListener('hashchange', () => document.removeEventListener('keydown', keyHandler), { once: true });

  async function answer(value) {
    if (answered) return;
    answered = true;
    const q = questions[index];
    lastCorrect = value === q.is_true;
    if (lastCorrect) correctCount++;
    if (lastCorrect) playCorrect(); else playWrong();
    draw();
    if (!lastCorrect) root.querySelector('.question-card')?.classList.add('shake');
    try {
      const { synced } = await recordAnswersResilient([{ id: q.id, correct: lastCorrect }]);
      if (offline !== !synced) { offline = !synced; draw(); }
    } catch (err) {
      root.prepend(errorBanner(err));
    }
  }

  function next() {
    answered = false;
    lastCorrect = null;
    revealed = false;
    index++;
    if (index >= questions.length) {
      document.removeEventListener('keydown', keyHandler);
      onFinish(correctCount, questions.length);
    } else {
      draw();
    }
  }

  function draw() {
    const q = questions[index];
    clear(root,
      offline
        ? el('p.offline-note', { role: 'status' },
            'OFFLINE — ANSWERS SAVED ON THIS DEVICE, WILL SYNC WHEN THE SERVER IS BACK')
        : null,
      el('div.quiz-head', {},
        el('a.btn', {
          href: backHash,
          onclick: (e) => {
            document.removeEventListener('keydown', keyHandler);
            if (onQuit) {
              e.preventDefault();
              onQuit();
            }
          },
        }, '← QUIT'),
        el('span.quiz-progress', {}, `${title} — ${index + 1}/${questions.length}`),
        el('span.tag.ok', {}, `${correctCount} CORRECT`),
        easyStart ? el('span.tag', {}, 'EASY START') : null,
      ),
      el('div.panel.question-card', {},
        q.image_url ? el('img.question-img', { src: q.image_url, alt: 'Road sign / situation', onerror: (e) => e.target.remove() }) : null,
        el('p.question-text', {}, q.text_it),
        translationArea(translationOf(q), revealed, reveal),
        answered
          ? el('div', {},
              el('div.feedback', { className: `feedback ${lastCorrect ? 'ok' : 'bad'}`, role: 'status' },
                lastCorrect ? 'CORRECT' : `WRONG — THE ANSWER IS ${q.is_true ? 'VERO' : 'FALSO'}`),
              lastCorrect
                ? null
                : whyBlock(q, () => document.removeEventListener('keydown', keyHandler)),
              el('div.actions', {},
                el('button.btn.btn-primary.btn-big', { onclick: next },
                  index + 1 >= questions.length ? 'FINISH' : 'NEXT →'),
              ),
              el('p.kbd-hint', {}, el('kbd', {}, 'ENTER'), ' NEXT · ', el('kbd', {}, 'T'), ' TRANSLATE'),
            )
          : el('div', {},
              el('div.answers', {},
                el('button.btn.btn-true', { onclick: () => answer(true) }, 'VERO'),
                el('button.btn.btn-false', { onclick: () => answer(false) }, 'FALSO'),
              ),
              el('p.kbd-hint', {},
                el('kbd', {}, 'V'), ' VERO · ', el('kbd', {}, 'F'), ' FALSO · ', el('kbd', {}, 'T'), ' TRANSLATE'),
            ),
      ),
    );
  }

  draw();
}

export async function renderPracticeSession(root, slug) {
  const cat = state.manifest.categories.find((c) => c.slug === slug);
  if (!cat) return clear(root, el('p.empty-note', {}, 'TOPIC NOT FOUND'));
  clear(root, el('h1', {}, titleCase(cat.name)), el('p.lede', {}, 'LOADING QUESTIONS...'));

  let questions;
  try {
    questions = await loadQuestions(slug);
  } catch (err) {
    return clear(root, errorBanner(err));
  }

  // Phase 2.2: a never-started profile opens on the topic's easiest
  // questions; image-heavy topics fall back to the regular queue.
  const beginner = Object.keys(state.progress.answers).length === 0;
  const intro = beginner ? introQueue(questions, { answers: state.progress.answers }) : null;
  const queue = intro ?? pickQueue(questions, PRACTICE_BATCH);

  renderQuizSession(root, queue, {
    title: titleCase(cat.name).toUpperCase(),
    backHash: '#/practice',
    easyStart: intro !== null,
    onFinish: (correct, total) => {
      clear(root,
        el('div.panel', { style: 'text-align:center' },
          el('h1', {}, 'SESSION COMPLETE'),
          el('p.stat-value.ok', {}, `${correct}/${total}`),
          el('p.lede', {}, 'CORRECT ANSWERS'),
          el('div.actions', { style: 'justify-content:center' },
            el('a.btn.btn-primary', { href: `#/practice/${slug}`, onclick: () => renderPracticeSession(root, slug) }, 'ONE MORE ROUND'),
            el('a.btn', { href: '#/practice' }, 'ALL TOPICS'),
            el('a.btn', { href: '#/' }, 'DASHBOARD'),
          ),
        ),
      );
    },
  });
}

/* ============================== MISTAKES ============================== */

export async function renderMistakes(root) {
  const ids = state.progress.mistakes;
  clear(root, el('h1', {}, 'MISTAKES REVIEW'), el('p.lede', {}, 'LOADING...'));

  if (ids.length === 0) {
    return clear(root,
      el('h1', {}, 'MISTAKES REVIEW'),
      el('div.panel', {},
        el('p.empty-note', {}, 'NO MISTAKES TO REVIEW. NICE WORK.'),
        el('div.actions', {}, el('a.btn.btn-primary', { href: '#/practice' }, 'GO PRACTICE')),
      ),
    );
  }

  const slugs = [...new Set(ids.map(slugForQuestionId).filter(Boolean))];
  let byId = new Map();
  try {
    for (const slug of slugs) {
      for (const q of await loadQuestions(slug)) byId.set(q.id, q);
    }
  } catch (err) {
    return clear(root, errorBanner(err));
  }
  const questions = ids.map((id) => byId.get(id)).filter(Boolean);

  clear(root,
    el('h1', {}, 'MISTAKES REVIEW'),
    el('p.lede', {}, `${questions.length} QUESTIONS YOU LAST ANSWERED WRONG. ANSWER CORRECTLY TO CLEAR THEM.`),
    el('div.actions', { style: 'margin-bottom:24px' },
      el('button.btn.btn-primary.btn-big', {
        onclick: () =>
          renderQuizSession(root, shuffle(questions), {
            title: 'MISTAKES',
            backHash: '#/mistakes',
            onFinish: () => renderMistakes(root),
          }),
      }, 'PRACTICE ALL MISTAKES'),
    ),
    el('div.panel', {},
      ...questions.slice(0, 50).map((q) =>
        el('div.row', {},
          el('span', { style: 'flex:1' }, q.text_it),
          el('span.tag.bad', {}, q.is_true ? 'VERO' : 'FALSO'),
        ),
      ),
      questions.length > 50 ? el('p.empty-note', {}, `+ ${questions.length - 50} MORE`) : null,
    ),
  );
}

/* ============================ QUICK REVIEW ============================ */

const REVIEW_SIZE = 10;

/**
 * Daily smart session: current mistakes first, then questions from the
 * weakest topics, then "retention" — questions answered correctly the
 * longest time ago. New users just get a starter mix.
 */
export async function renderQuickReview(root) {
  clear(root, el('h1', {}, 'QUICK REVIEW'), el('p.lede', {}, 'BUILDING YOUR SESSION...'));
  const picked = new Map(); // id -> question

  async function resolveIds(ids) {
    const bySlug = new Map();
    for (const id of ids) {
      const slug = slugForQuestionId(id);
      if (slug) (bySlug.get(slug) ?? bySlug.set(slug, []).get(slug)).push(id);
    }
    const out = [];
    for (const [slug, list] of bySlug) {
      try {
        const qs = await loadQuestions(slug);
        const byId = new Map(qs.map((q) => [q.id, q]));
        for (const id of list) if (byId.has(id)) out.push(byId.get(id));
      } catch {
        /* skip unavailable topics */
      }
    }
    return out;
  }

  try {
    // 1. Mistakes — the highest-value repetitions (up to 4).
    for (const q of await resolveIds(shuffle(state.progress.mistakes).slice(0, 4))) {
      picked.set(q.id, q);
    }

    // 2. Weakest attempted topics — unseen/wrong questions first (up to 4).
    const weak = categoryStats()
      .filter((c) => c.attempted > 0 && c.accuracy !== null && c.accuracy < 100)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 2);
    for (const c of weak) {
      const qs = await loadQuestions(c.slug);
      for (const q of pickQueue(qs.filter((q) => !picked.has(q.id)), 2)) picked.set(q.id, q);
    }

    // 3. Retention — correct answers not seen for the longest time.
    if (picked.size < REVIEW_SIZE) {
      const stale = Object.entries(state.progress.answers)
        .filter(([id, a]) => a.lastCorrect && !picked.has(id))
        .sort((a, b) => (a[1].last || '').localeCompare(b[1].last || ''))
        .slice(0, REVIEW_SIZE - picked.size)
        .map(([id]) => id);
      for (const q of await resolveIds(stale)) picked.set(q.id, q);
    }

    // 4. Starter fill for new users: unseen questions from random topics.
    if (picked.size < REVIEW_SIZE) {
      for (const c of shuffle(state.manifest.categories).slice(0, 3)) {
        if (picked.size >= REVIEW_SIZE) break;
        const qs = await loadQuestions(c.slug);
        for (const q of pickQueue(qs.filter((q) => !picked.has(q.id)), REVIEW_SIZE - picked.size)) {
          picked.set(q.id, q);
        }
      }
    }
  } catch (err) {
    return clear(root, errorBanner(err));
  }

  const queue = shuffle([...picked.values()]).slice(0, REVIEW_SIZE);
  renderQuizSession(root, queue, {
    title: 'QUICK REVIEW',
    backHash: '#/',
    onQuit: () => { location.hash = '#/'; },
    onFinish: (correct, total) => {
      clear(root,
        el('h1', {}, 'QUICK REVIEW DONE'),
        el('div.panel', {},
          el('p.stat-value', { className: `stat-value ${correct === total ? 'ok' : ''}` },
            `${correct}/${total}`),
          el('p.stat-sub', {}, correct === total
            ? 'PERFECT. SAME TIME TOMORROW.'
            : 'MISSES WENT TO YOUR MISTAKES LIST — THEY WILL COME BACK.'),
          el('div.actions', { style: 'margin-top:16px' },
            el('a.btn.btn-primary', { href: '#/' }, 'DASHBOARD'),
            el('button.btn', { onclick: () => renderQuickReview(root) }, 'ONE MORE ROUND'),
          ),
        ),
      );
    },
  });
}

/* ============================== EXAM ============================== */

export async function renderExam(root) {
  clear(root,
    el('h1', {}, 'MOCK EXAM'),
    el('p.lede', {},
      'THIS IS PRACTICE, NOT THE OFFICIAL EXAM — BUT THE FORMAT AND THE DIFFICULTY ARE IDENTICAL.'),
    el('div.panel', {},
      el('h2', {}, 'HOW THE REAL EXAM WORKS'),
      el('p.stat-sub', {}, '30 RANDOM QUESTIONS ON SIGNS AND TRAFFIC RULES'),
      el('p.stat-sub', {}, '20 MINUTES — THE TIMER STARTS THE MOMENT YOU BEGIN'),
      el('p.stat-sub', {}, 'PASS WITH AT MOST 3 ERRORS — MORE, AND THE EXAM FAILS'),
      el('p.stat-sub', {}, 'MOVE BACK AND FORTH BETWEEN QUESTIONS — UNANSWERED COUNTS AS WRONG'),
      el('p.stat-sub', {},
        'QUESTIONS ARE IN ITALIAN; ', el('kbd', {}, 'T'),
        ' OR THE TRANSLATE BUTTON SHOWS YOUR LANGUAGE'),
      el('div.actions', {},
        el('button.btn.btn-primary.btn-big', { onclick: start }, 'BEGIN EXAM'),
        el('a.btn', { href: '#/' }, 'NOT YET'),
      ),
    ),
  );

  async function start() {
    clear(root, el('h1', {}, 'MOCK EXAM'), el('p.lede', { id: 'load-note' }, 'LOADING QUESTION BANK...'));
    let all;
    try {
      all = await loadAllQuestions((done, total) => {
        const note = document.getElementById('load-note');
        if (note) note.textContent = `LOADING QUESTION BANK... ${done}/${total}`;
      });
    } catch (err) {
      return clear(root, errorBanner(err));
    }
    runExam(root, shuffle(all).slice(0, EXAM_QUESTIONS));
  }
}

function runExam(root, questions) {
  const chosen = new Array(questions.length).fill(null);
  let index = 0;
  let secondsLeft = EXAM_SECONDS;
  let finished = false;
  let revealed = false; // translation visibility, reset per question

  const timerEl = el('span.timer', { role: 'timer', 'aria-label': 'Time left' }, fmtTime(secondsLeft));
  // Navigating away abandons the exam: stop the timer and keys so they
  // cannot fire over a different screen.
  window.addEventListener('hashchange', () => {
    finished = true;
    clearInterval(interval);
    document.removeEventListener('keydown', keyHandler);
  }, { once: true });
  const interval = setInterval(() => {
    if (finished) return clearInterval(interval);
    secondsLeft--;
    timerEl.textContent = fmtTime(secondsLeft);
    if (secondsLeft <= 60) timerEl.classList.add('low');
    if (secondsLeft <= 0) submit();
  }, 1000);

  function keyHandler(e) {
    if (finished) return;
    const key = e.key.toLowerCase();
    if (key === 'v') choose(true);
    if (key === 'f') choose(false);
    if (key === 't') { revealed = true; draw(); }
    if (key === 'arrowleft' && index > 0) { index--; revealed = false; draw(); }
    if (key === 'arrowright' && index < questions.length - 1) { index++; revealed = false; draw(); }
  }
  document.addEventListener('keydown', keyHandler);

  function goTo(i) {
    index = i;
    revealed = false;
    draw();
  }

  function choose(value) {
    chosen[index] = value;
    if (index < questions.length - 1) index++;
    revealed = false;
    draw();
  }

  async function submit() {
    if (finished) return;
    finished = true;
    clearInterval(interval);
    document.removeEventListener('keydown', keyHandler);
    const errors = questions.reduce(
      (n, q, i) => n + (chosen[i] === q.is_true ? 0 : 1), 0);
    const passed = errors <= EXAM_MAX_ERRORS;

    clear(root, el('h1', {}, 'MOCK EXAM'), el('p.lede', {}, 'SAVING RESULT...'));
    // A finished exam must survive a network blip: both the result and
    // the answers go through the offline-capable queue.
    let synced = true;
    try {
      ({ synced } = await recordExamResilient({ total: questions.length, errors, passed }));
      const answerSync = await recordAnswersResilient(
        questions.map((q, i) => ({ id: q.id, correct: chosen[i] === q.is_true })),
      );
      synced = synced && answerSync.synced;
    } catch (err) {
      root.prepend(errorBanner(err));
    }

    const wrongOnes = questions.filter((q, i) => chosen[i] !== q.is_true);
    clear(root,
      synced
        ? null
        : el('p.offline-note', { role: 'status' },
            'OFFLINE — THIS RESULT IS SAVED ON THIS DEVICE AND WILL SYNC LATER'),
      el('div.panel', { style: 'text-align:center' },
        el('h1', {}, passed ? 'PROMOSSO!' : 'BOCCIATO'),
        el('p.stat-value', { className: `stat-value ${passed ? 'ok' : 'accent'}` },
          `${errors} ERRORS`),
        el('p.lede', {}, `OUT OF ${questions.length} QUESTIONS (LIMIT: ${EXAM_MAX_ERRORS})`),
        el('div.actions', { style: 'justify-content:center' },
          el('button.btn.btn-primary', { onclick: () => renderExam(root) }, 'TRY AGAIN'),
          wrongOnes.length ? el('a.btn', { href: '#/mistakes' }, 'REVIEW MISTAKES') : null,
          el('a.btn', { href: '#/' }, 'DASHBOARD'),
        ),
      ),
      wrongOnes.length
        ? el('div.panel', {},
            el('h2', {}, 'WHAT WENT WRONG'),
            ...wrongOnes.map((q) =>
              el('div.row', {},
                el('span', { style: 'flex:1' }, q.text_it),
                el('span.tag.bad', {}, `ANSWER: ${q.is_true ? 'VERO' : 'FALSO'}`),
              ),
            ),
          )
        : null,
    );
  }

  function draw() {
    const q = questions[index];
    const answeredCount = chosen.filter((c) => c !== null).length;
    clear(root,
      el('div.quiz-head', {},
        el('span.quiz-progress', {}, `QUESTION ${index + 1}/${questions.length}`),
        timerEl,
        el('span.tag', {}, `${answeredCount} ANSWERED`),
      ),
      el('div.panel.question-card', {},
        q.image_url ? el('img.question-img', { src: q.image_url, alt: 'Road sign / situation', onerror: (e) => e.target.remove() }) : null,
        el('p.question-text', {}, q.text_it),
        translationArea(translationOf(q), revealed, () => { revealed = true; draw(); }),
        el('div.answers', {},
          el('button.btn.btn-true', {
            style: chosen[index] === true ? 'outline:4px solid var(--ink)' : '',
            onclick: () => choose(true),
          }, 'VERO'),
          el('button.btn.btn-false', {
            style: chosen[index] === false ? 'outline:4px solid var(--ink)' : '',
            onclick: () => choose(false),
          }, 'FALSO'),
        ),
        el('p.kbd-hint', {},
          el('kbd', {}, 'V'), ' VERO · ', el('kbd', {}, 'F'), ' FALSO · ',
          el('kbd', {}, '←'), el('kbd', {}, '→'), ' NAVIGATE · ', el('kbd', {}, 'T'), ' TRANSLATE'),
        el('div.exam-nav', {},
          ...questions.map((_, i) =>
            el('button', {
              textContent: String(i + 1),
              className: `${chosen[i] !== null ? 'answered' : ''} ${i === index ? 'current' : ''}`,
              onclick: () => goTo(i),
            }),
          ),
        ),
        el('div.actions', {},
          el('button.btn.btn-primary.btn-big', {
            onclick: () => {
              const left = chosen.filter((c) => c === null).length;
              if (left === 0 || confirm(`${left} unanswered (counted as wrong). Submit anyway?`)) submit();
            },
          }, 'SUBMIT EXAM'),
        ),
      ),
    );
  }

  draw();
}


/* Settings screen lives in views/settings.js (Sprint 1, S1.3). */
export { renderSettings } from './views/settings.js';

/* Search screen lives in views/search.js (Sprint 1, S1.4). */
export { renderSearch } from './views/search.js';

/* Dictionary screen lives in views/dictionary.js (Sprint 1, S1.5). */
export { renderDictionary } from './views/dictionary.js';


/* Stats screen lives in views/stats.js (Sprint 1, S1.6). */
export { renderStats } from './views/stats.js';