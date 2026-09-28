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
import { dayKey, weekStrip } from './views/stats.js';

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

/**
 * Modal describing one road sign. The description is built from the
 * question bank itself: TRUE statements about this sign are factual
 * "what it means" sentences. onPractice starts a session with all of
 * the sign's questions.
 */
function showSignModal(imageUrl, signQuestions, onPractice) {
  const facts = signQuestions.filter((q) => q.is_true).slice(0, 4);
  let revealed = false;
  const opener = document.activeElement; // restore focus here on close

  const overlay = el('div.modal-overlay', {
    onclick: (e) => { if (e.target === overlay) close(); },
  });

  function close() {
    document.removeEventListener('keydown', escHandler);
    overlay.remove();
    if (opener instanceof HTMLElement) opener.focus();
  }

  function escHandler(e) {
    if (e.key === 'Escape') close();
    if (e.key.toLowerCase() === 't' && !revealed) { revealed = true; draw(); }
  }
  document.addEventListener('keydown', escHandler);

  function draw() {
    overlay.replaceChildren(
      el('div.modal', { role: 'dialog', 'aria-modal': 'true' },
        el('div.quiz-head', {},
          el('h2', { style: 'margin:0' }, 'WHAT THIS SIGN MEANS'),
          el('button.btn.btn-icon', { onclick: close, 'aria-label': 'Close' }, '✕'),
        ),
        el('img.modal-sign', { src: imageUrl, alt: 'Road sign' }),
        facts.length
          ? el('div', {},
              ...facts.map((q) =>
                el('div.fact', {},
                  el('p', {}, q.text_it),
                  revealed && translationOf(q)
                    ? el('p.fact-translation', {}, translationOf(q))
                    : null,
                ),
              ),
              !revealed
                ? el('button.btn.btn-small.btn-translate', {
                    onclick: () => { revealed = true; draw(); },
                  }, `TRANSLATE (${lang().toUpperCase()})`)
                : null,
            )
          : el('p.empty-note', {}, 'NO DESCRIPTION IN THE QUESTION BANK'),
        el('div.actions', {},
          el('button.btn.btn-primary', {
            onclick: () => { close(); onPractice(); },
          }, `PRACTICE THIS SIGN — ${signQuestions.length} QUESTIONS`),
          el('button.btn', { onclick: close }, 'CLOSE'),
        ),
      ),
    );
  }

  draw();
  document.body.append(overlay);
  overlay.querySelector('button[aria-label="Close"]')?.focus();
}

/* ============================== ONBOARDING ================ */
export { renderOnboarding } from './views/onboarding.js';

/* ============================== DASHBOARD ============================== */

/** A hard-edged progress ring: brutalism, so square caps and no gradient. */
function progressRing(percent, { size = 104, stroke = 12, label = '' } = {}) {
  const pct = Math.max(0, Math.min(100, percent));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const svgNS = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'ring');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${label}: ${pct}%`);

  const track = document.createElementNS(svgNS, 'circle');
  track.setAttribute('cx', size / 2);
  track.setAttribute('cy', size / 2);
  track.setAttribute('r', r);
  track.setAttribute('class', 'ring-track');
  track.setAttribute('stroke-width', stroke);

  const value = document.createElementNS(svgNS, 'circle');
  value.setAttribute('cx', size / 2);
  value.setAttribute('cy', size / 2);
  value.setAttribute('r', r);
  value.setAttribute('class', 'ring-value');
  value.setAttribute('stroke-width', stroke);
  value.setAttribute('stroke-dasharray', `${circumference}`);
  // A hair of the ring always shows, so 0% still reads as "a ring".
  value.setAttribute('stroke-dashoffset', `${circumference * (1 - pct / 100)}`);
  value.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);

  svg.append(track, value);
  return svg;
}

/**
 * Dashboard next-step for a newcomer: no raw numbers — one action.
 * Shown until the first answer is recorded.
 */
function nextStepsPanel() {
  return el('div.panel', { id: 'dashboard-next-steps', style: 'margin-top:24px' },
    el('h2', {}, 'NEXT STEP'),
    el('p.lede', {},
      `You have not answered a question yet. Start with practice: ${PRACTICE_BATCH} questions on a topic you pick — about 5 minutes.`),
    el('div.actions', {},
      el('a.btn.btn-primary.btn-big', { href: '#/practice' }, 'PICK A TOPIC AND START PRACTICE'),
      el('a.btn', { href: '#/theory' }, 'PREFER READING FIRST — OPEN THE THEORY'),
    ),
  );
}

/**
 * "Until the exam" panel: what to fix next, computed from real data —
 * the weakest attempted topics (accuracy < 70%) and pending mistakes.
 * Shown once at least one mock exam exists.
 */
function weakSpotsPanel() {
  const { exams } = state.progress;
  const last = exams[exams.length - 1];
  const weak = categoryStats()
    .filter((c) => c.attempted && c.accuracy < 70)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);
  return el('div.panel', { id: 'dashboard-exam-readiness', style: 'margin-top:24px' },
    el('div.quiz-head', { style: 'margin-bottom:12px' },
      el('h2', { style: 'margin:0' }, 'UNTIL THE EXAM'),
      el('span.tag', { className: `tag ${last.passed ? 'ok' : 'bad'}` },
        `LAST: ${last.errors} ERRORS — ${last.passed ? 'PASSED' : 'FAILED'}`),
    ),
    weak.length
      ? el('div', {},
          ...weak.map((c) =>
            el('div.row', {},
              el('span', {}, titleCase(c.name)),
              el('span.tag', { className: 'tag bad' }, `${c.accuracy}%`),
            ),
          ),
        )
      : el('p.empty-note', {}, 'NO WEAK TOPIC UNDER 70% — KEEP THE STREAK ALIVE'),
    el('div.actions', {},
      weak.length
        ? el('a.btn.btn-primary', { href: `#/practice/${weak[0].slug}` },
            `STRENGTHEN ${titleCase(weak[0].name).toUpperCase()}`)
        : el('a.btn.btn-primary', { href: '#/exam' }, 'ANOTHER MOCK EXAM'),
      state.progress.stats.mistakes > 0
        ? el('a.btn', { href: '#/mistakes' }, `REVIEW ${state.progress.stats.mistakes} MISTAKES`)
        : null,
    ),
  );
}

export function renderDashboard(root) {
  const { profile, stats, exams } = state.progress;
  const total = state.manifest.totalQuestions;
  const masteredPct = Math.round((stats.mastered / total) * 100);
  const recentExams = [...exams].slice(-5).reverse();

  const week = weekStrip(state.progress.activeDays);
  const daysThisWeek = week.filter((d) => d.studied).length;
  const answeredToday = state.progress.dailyAnswers?.[dayKey(new Date())] ?? 0;
  const goal = dailyGoal();
  const goalPct = Math.min(100, Math.round((answeredToday / goal) * 100));

  clear(root,
    el('h1', {}, profile.name ? `CIAO, ${profile.name}` : 'CIAO'),
    el('p.lede', {}, 'READY FOR THE EXAM? KEEP THE STREAK ALIVE.'),

    // The habit, at a glance: which of the last seven days you studied.
    el('div.panel.week-panel', {},
      el('div.quiz-head', { style: 'margin-bottom:12px' },
        el('h2', { style: 'margin:0' }, 'THIS WEEK'),
        el('span.tag', { className: `tag ${daysThisWeek >= 5 ? 'ok' : ''}` },
          `${daysThisWeek}/7 DAYS`),
      ),
      el('div.week-row', {},
        el('div.week', { role: 'img', 'aria-label': `Studied on ${daysThisWeek} of the last 7 days` },
          ...week.map((day) =>
            el('div.week-day', {
              className: `week-day${day.studied ? ' done' : ''}${day.isToday ? ' today' : ''}`,
            },
              el('span.week-cell', { 'aria-hidden': 'true' }, day.studied ? '✓' : ''),
              el('span.week-label', { 'aria-hidden': 'true' }, day.label),
            ),
          ),
        ),
        // The ring tracks today's goal, which actually moves — mastery of
        // 7139 questions would sit near zero for weeks and read as broken.
        el('div.today-goal', {},
          el('div.ring-wrap', {},
            progressRing(goalPct, { label: "Today's goal" }),
            el('div.ring-centre', {},
              el('span.ring-pct', {}, String(answeredToday)),
              el('span.ring-sub', {}, `/ ${goal}`),
            ),
          ),
          el('span.week-label', {}, answeredToday >= goal ? 'GOAL DONE' : 'TODAY'),
        ),
      ),
    ),

    el('div.grid.grid-3', {},
      el('div.card', {},
        el('h2', {}, 'LOGIN STREAK'),
        el('p.stat-value.accent', {}, String(stats.streak)),
        el('p.stat-sub', {}, stats.streak === 1 ? 'DAY IN A ROW' : 'DAYS IN A ROW'),
      ),
      el('div.card', {},
        el('h2', {}, 'QUESTIONS MASTERED'),
        el('p.stat-value.ok', {}, String(stats.mastered)),
        el('p.stat-sub', {}, `OF ${total} (${masteredPct}%)`),
        el('div.bar', { 'aria-hidden': 'true' }, el('div', { style: `width:${masteredPct}%` })),
      ),
      el('div.card', {},
        el('h2', {}, 'EXAM SUCCESS'),
        el('p.stat-value', {}, `${stats.examSuccess}%`),
        el('p.stat-sub', {}, `${stats.examsPassed}/${stats.examsTaken} MOCK EXAMS PASSED`),
      ),
    ),
    // A newcomer gets the next action instead of raw zeros (Phase 2.2);
    // a user who took an exam gets "what to fix until the exam".
    stats.answered === 0
      ? nextStepsPanel()
      : null,
    exams.length > 0
      ? weakSpotsPanel()
      : null,
    el('div.panel', { style: 'margin-top:24px' },
      el('h2', {}, "PRONTO PER L'ESAME?"),
      el('p.lede', {}, `${EXAM_QUESTIONS} random questions · ${EXAM_SECONDS / 60} minutes · max ${EXAM_MAX_ERRORS} errors.`),
      el('div.actions', {},
        el('a.btn.btn-primary.btn-big', { href: '#/exam' }, 'START MOCK EXAM'),
        el('a.btn', { href: '#/review' }, `QUICK REVIEW — ${REVIEW_SIZE} QUESTIONS`),
        el('a.btn', { href: '#/practice' }, 'PRACTICE BY TOPIC'),
        el('a.btn', { href: '#/theory' }, 'READ THEORY'),
        el('a.btn', { href: '#/stats' }, 'PROGRESS & STATS'),
        stats.mistakes > 0
          ? el('a.btn', { href: '#/mistakes' }, `REVIEW ${stats.mistakes} MISTAKES`)
          : null,
      ),
    ),
    recentExams.length
      ? el('div.panel', {},
          el('h2', {}, 'RECENT MOCK EXAMS'),
          ...recentExams.map((e) =>
            el('div.row', {},
              el('span', {}, fmtDate(e.date)),
              el('span', {}, `${e.errors} ERRORS / ${e.total}`),
              el('span.tag', { className: `tag ${e.passed ? 'ok' : 'bad'}` }, e.passed ? 'PASSED' : 'FAILED'),
            ),
          ),
        )
      : null,
  );
}


/* ============================== THEORY ============================== */

export async function renderTheoryList(root) {
  clear(root, el('h1', {}, 'THEORY MANUAL'), el('p.lede', {}, 'LOADING...'));
  let chapters;
  try {
    chapters = await loadTheory();
  } catch (err) {
    return clear(root, errorBanner(err));
  }
  const read = new Set(state.progress.theoryRead);
  const readPct = Math.round((read.size / chapters.length) * 100);
  const firstUnread = chapters.find((c) => !read.has(c.id));
  const catBySlug = new Map(state.manifest.categories.map((c) => [c.slug, c]));
  let lessonChapters = new Set();
  try {
    lessonChapters = new Set(Object.keys((await loadLessons()).chapters || {}));
  } catch {
    /* list still renders without the lesson layer */
  }

  clear(root,
    el('h1', {}, 'THEORY MANUAL'),
    el('p.lede', {}, 'READ THE ITALIAN FIRST — TRANSLATE ONLY WHEN STUCK.'),
    el('div.panel', {},
      el('div.quiz-head', {},
        el('h2', { style: 'margin:0' }, 'READING PROGRESS'),
        el('span.tag', { className: `tag ${read.size === chapters.length ? 'ok' : ''}` },
          `${read.size}/${chapters.length} CHAPTERS`),
      ),
      el('div.bar', { 'aria-hidden': 'true' }, el('div', { style: `width:${readPct}%` })),
      el('div.actions', {},
        firstUnread
          ? el('a.btn.btn-primary', { href: `#/theory/${firstUnread.id}` },
              `CONTINUE — CHAPTER ${firstUnread.chapter}`)
          : null,
        el('a.btn', { href: '#/dictionary' }, 'DIZIONARIO — EXAM VOCABULARY'),
      ),
    ),
    el('a.panel.exam-italian-banner', { href: '#/exam-italian' },
      el('div.quiz-head', { style: 'margin:0' },
        el('div', {},
          el('h2', { style: 'margin-bottom:4px' }, "L'ITALIANO DELL'ESAME"),
          el('p.stat-sub', {},
            'SEMPRE · MAI · SOLO · DEVE · PUÒ — THE WORDS THAT DECIDE VERO OR FALSO. START HERE.'),
        ),
        el('span.tag.warn', {}, 'GUIDE'),
      ),
    ),
    el('div.grid.grid-2', {},
      ...chapters.map((ch) => {
        const slug = CHAPTER_CATEGORY[ch.id];
        const cat = catBySlug.get(slug);
        const m = cat ? masteryOf(slug, cat.count) : null;
        return el('a.card', { href: `#/theory/${ch.id}` },
          el('div.quiz-head', {},
            el('span.tag', {}, `CHAPTER ${ch.chapter}`),
            el('span', { style: 'display:flex;gap:6px' },
              lessonChapters.has(ch.id) ? el('span.tag.accent-tag', {}, 'LESSON') : null,
              read.has(ch.id) ? el('span.tag.ok', {}, 'READ') : el('span.tag.warn', {}, 'NEW'),
            ),
          ),
          el('h2', {}, ch.title_it),
          el('p.stat-sub', {}, ch.translations?.[lang()]?.title || ''),
          m
            ? el('div', {},
                el('p.stat-sub', {}, `${cat.count} QUESTIONS · MASTERED ${m.pct}%`),
                el('div.bar', { 'aria-hidden': 'true' }, el('div', { style: `width:${m.pct}%` })),
              )
            : null,
        );
      }),
    ),
  );
}

export async function renderTheoryChapter(root, id, opts = {}) {
  let chapters;
  try {
    chapters = await loadTheory();
  } catch (err) {
    return clear(root, errorBanner(err));
  }
  const ch = chapters.find((c) => c.id === id);
  if (!ch) return clear(root, el('p.empty-note', {}, 'CHAPTER NOT FOUND'));
  const tr = ch.translations?.[lang()];

  // Linked question-bank topic: powers the signs gallery and self-check.
  const slug = CHAPTER_CATEGORY[ch.id];
  const cat = state.manifest.categories.find((c) => c.slug === slug);
  let catQuestions = [];
  if (cat) {
    try {
      catQuestions = await loadQuestions(slug);
    } catch {
      /* chapter still readable without the question bank */
    }
  }
  const signs = [...new Set(catQuestions.map((q) => q.image_url).filter(Boolean))].slice(0, 18);
  let lesson = null;
  try {
    lesson = (await loadLessons()).chapters?.[ch.id] || null;
  } catch {
    /* chapter still readable without the lesson layer */
  }
  // Traps quote real bank questions; resolve them so text/image/answer
  // can never drift from the data. Unresolvable ids are dropped.
  const traps = (lesson?.traps || [])
    .map((t) => ({ ...t, q: catQuestions.find((q) => q.id === t.id) }))
    .filter((t) => t.q);
  const trapRevealed = new Set();
  let dictionary = { sections: [] };
  try {
    dictionary = await loadDictionary();
  } catch {
    /* chapter still readable without the dictionary */
  }
  const vocabSections = dictionary.sections.filter((s) => s.chapters.includes(ch.id));
  const sorted = [...chapters].sort((a, b) => a.chapter - b.chapter);
  const pos = sorted.indexOf(ch);
  const prev = sorted[pos - 1];
  const next = sorted[pos + 1];

  // Translation stays hidden until asked for: read the Italian first.
  let revealed = false;

  function keyHandler(e) {
    if (e.key.toLowerCase() === 't' && !revealed) {
      revealed = true;
      draw();
    }
  }
  document.addEventListener('keydown', keyHandler);
  window.addEventListener('hashchange', () => document.removeEventListener('keydown', keyHandler), { once: true });

  function startCheck() {
    document.removeEventListener('keydown', keyHandler);
    renderQuizSession(root, pickQueue(catQuestions, 5), {
      title: `CHECK — CAP. ${ch.chapter}`,
      backHash: `#/theory/${id}`,
      onQuit: () => renderTheoryChapter(root, id),
      onFinish: (correct, total) => renderTheoryChapter(root, id, { quizResult: { correct, total } }),
    });
  }

  async function markRead(e) {
    try {
      const { theoryRead } = await api.markTheoryRead(ch.id);
      state.progress.theoryRead = theoryRead;
      draw();
    } catch (err) {
      e.target.replaceWith(errorBanner(err));
    }
  }

  function draw() {
    const isRead = state.progress.theoryRead.includes(ch.id);
    const m = cat ? masteryOf(slug, cat.count) : null;
    clear(root,
      el('div.quiz-head', {},
        el('a.btn', { href: '#/theory' }, '← ALL CHAPTERS'),
        el('span.tag', {}, `CHAPTER ${ch.chapter}/${sorted.length}`),
        isRead ? el('span.tag.ok', {}, 'READ') : el('span.tag.warn', {}, 'NEW'),
      ),
      el('h1', { style: 'margin-top:20px' }, ch.title_it),
      revealed && tr?.title ? el('p.lede', {}, tr.title.toUpperCase()) : null,

      opts.quizResult
        ? el('div.feedback', {
            className: `feedback ${opts.quizResult.correct === opts.quizResult.total ? 'ok' : 'bad'}`,
            style: 'margin:0 0 20px',
          }, `SELF-CHECK: ${opts.quizResult.correct}/${opts.quizResult.total} CORRECT`)
        : null,

      lesson
        ? el('div.panel.lesson-objective', {},
            el('h2', {}, 'IN THIS LESSON'),
            el('p.lede', { style: 'margin:0' }, loc(lesson.objective).toUpperCase()),
          )
        : null,

      lesson?.keyIdeas?.length
        ? el('div.panel', {},
            el('h2', {}, 'KEY IDEAS'),
            ...lesson.keyIdeas.map((idea, i) =>
              el('div.key-idea', {},
                el('div.key-idea-num', {}, String(i + 1)),
                el('div', {},
                  el('strong.key-idea-title', {}, idea.title_it),
                  el('p.key-idea-text', {}, loc(idea.text)),
                ),
              ),
            ),
          )
        : null,

      el('div.panel.chapter-body', {},
        el('h2', {}, 'ORIGINAL TEXT (ITALIAN)'),
        el('p', {}, ch.content_it),
        revealed && tr?.content
          ? el('div.translation-block', {}, el('strong', {}, 'TRANSLATION — '), tr.content)
          : null,
        revealed && tr?.simple_it
          ? el('div.simple-block', {}, el('strong', {}, 'IN SIMPLE WORDS — '), tr.simple_it)
          : null,
        !revealed && (tr?.content || tr?.simple_it)
          ? el('button.btn.btn-small.btn-translate', {
              onclick: () => { revealed = true; draw(); },
            }, `TRANSLATE (${lang().toUpperCase()})`)
          : null,
      ),

      lesson?.mustKnow?.length
        ? el('div.panel', {},
            el('h2', {}, 'MUST KNOW — NUMBERS & FACTS'),
            ...lesson.mustKnow.map((f) =>
              el('div.row', {},
                el('div', { style: 'flex:1' },
                  el('strong', {}, f.fact_it),
                  f.note ? el('p.stat-sub', {}, loc(f.note)) : null,
                ),
                el('span.tag.must-value', {}, f.value.toUpperCase()),
              ),
            ),
          )
        : null,

      traps.length
        ? el('div.panel.traps-panel', {},
            el('h2', {}, 'HOW THE EXAM TRICKS YOU HERE'),
            el('p.stat-sub', { style: 'margin-bottom:14px' },
              'REAL EXAM QUESTIONS. DECIDE VERO OR FALSO, THEN REVEAL THE TRAP.'),
            ...traps.map((t, i) =>
              el('div.trap', {},
                t.q.image_url
                  ? el('img.trap-img', { src: t.q.image_url, alt: 'Road sign', loading: 'lazy' })
                  : null,
                el('p.trap-text', {}, `«${t.q.text_it}»`),
                trapRevealed.has(i)
                  ? el('div.trap-answer', {},
                      el('span.tag', { className: `tag ${t.q.is_true ? 'ok' : 'bad'}` },
                        t.q.is_true ? 'VERO' : 'FALSO'),
                      el('p.trap-why', {}, loc(t.why)),
                    )
                  : el('button.btn.btn-small', {
                      onclick: () => { trapRevealed.add(i); draw(); },
                    }, 'REVEAL THE TRAP'),
              ),
            ),
            el('div.actions', {},
              el('a.btn.btn-small', { href: '#/exam-italian' }, 'FULL GUIDE: THE ITALIAN OF THE EXAM →'),
            ),
          )
        : null,

      signs.length
        ? el('div.panel', {},
            el('h2', {}, `SIGNS IN THIS CHAPTER — ${signs.length}`),
            el('p.stat-sub', { style: 'margin-bottom:12px' }, 'TAP A SIGN TO SEE WHAT IT MEANS'),
            el('div.signs-grid', {},
              ...signs.map((src) =>
                el('button.sign-tile', {
                  'aria-label': 'Show sign description',
                  onclick: () => {
                    const signQuestions = catQuestions.filter((q) => q.image_url === src);
                    showSignModal(src, signQuestions, () => {
                      document.removeEventListener('keydown', keyHandler);
                      renderQuizSession(root, pickQueue(signQuestions, signQuestions.length), {
                        title: 'SIGN PRACTICE',
                        backHash: `#/theory/${id}`,
                        onQuit: () => renderTheoryChapter(root, id),
                        onFinish: (correct, total) =>
                          renderTheoryChapter(root, id, { quizResult: { correct, total } }),
                      });
                    });
                  },
                }, el('img', { src, alt: 'Road sign', loading: 'lazy', onerror: (e) => e.target.closest('button').remove() })),
              ),
            ),
          )
        : null,

      vocabSections.length
        ? el('div.panel', {},
            el('h2', {}, 'VOCABULARY OF THIS CHAPTER'),
            ...vocabSections.map((s) =>
              el('div.row', {},
                el('div', {},
                  el('strong', {}, s.title_it),
                  el('p.stat-sub', {}, `${s.terms.length} TERMS · ${s.titles?.[lang()] || ''}`),
                ),
                el('a.btn.btn-small', { href: `#/dictionary/${s.id}` }, 'OPEN'),
              ),
            ),
          )
        : null,

      cat
        ? el('div.panel', {},
            el('h2', {}, 'CHECK YOURSELF'),
            el('p.stat-sub', {}, `${cat.count} QUESTIONS IN THIS TOPIC · MASTERED ${m.mastered} (${m.pct}%)`),
            el('div.bar', { 'aria-hidden': 'true' }, el('div', { style: `width:${m.pct}%` })),
            el('div.actions', {},
              el('button.btn.btn-primary', { onclick: startCheck }, 'QUICK CHECK — 5 QUESTIONS'),
              el('a.btn', { href: `#/practice/${slug}` }, 'FULL PRACTICE'),
            ),
          )
        : null,

      el('div.actions', {},
        isRead
          ? el('span.tag.ok', {}, 'MARKED AS READ')
          : el('button.btn.btn-primary', { onclick: markRead }, 'MARK AS READ'),
      ),
      el('div.chapter-nav', {},
        prev
          ? el('a.btn', { href: `#/theory/${prev.id}` }, `← CAP. ${prev.chapter}`)
          : el('span', {}),
        next
          ? el('a.btn', { href: `#/theory/${next.id}` }, `CAP. ${next.chapter} →`)
          : el('span', {}),
      ),
    );
  }

  draw();
}

/* ========================== EXAM ITALIAN GUIDE ========================== */

/**
 * A language survival guide for the quiz: the small set of Italian words
 * and sentence patterns that decide VERO/FALSO. This is the single most
 * valuable page for non-Italian speakers.
 */
export async function renderExamItalian(root) {
  clear(root, el('h1', {}, "L'ITALIANO DELL'ESAME"), el('p.lede', {}, 'LOADING...'));
  let guide;
  try {
    guide = (await loadLessons()).examItalian;
  } catch (err) {
    return clear(root, errorBanner(err));
  }

  clear(root,
    el('div.quiz-head', {},
      el('h1', { style: 'margin:0' }, "L'ITALIANO DELL'ESAME"),
      el('a.btn', { href: '#/theory' }, '← THEORY'),
    ),
    el('p.lede', {}, 'THE WORDS THAT DECIDE VERO OR FALSO.'),
    el('div.panel.lesson-objective', {},
      el('p', { style: 'margin:0;font-weight:600' }, loc(guide.intro)),
    ),
    ...guide.sections.map((s) =>
      el('div.panel', {},
        el('h2', {}, s.title_it.toUpperCase()),
        el('p.section-explain', {}, loc(s.explain)),
        el('div.word-grid', {},
          ...s.entries.map((w) =>
            el('div.word-card', {},
              el('strong.word-it', {}, w.it),
              el('span.word-gloss', {}, loc(w.gloss)),
            ),
          ),
        ),
      ),
    ),
    el('div.panel.traps-panel', {},
      el('h2', {}, "INSTRUCTOR'S RULES OF THUMB"),
      ...guide.tips.map((t, i) =>
        el('div.key-idea', {},
          el('div.key-idea-num', {}, String(i + 1)),
          el('p.key-idea-text', { style: 'margin:0' }, loc(t)),
        ),
      ),
    ),
    el('div.actions', {},
      el('a.btn.btn-primary', { href: '#/practice' }, 'APPLY IT — PRACTICE NOW'),
    ),
  );
}

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