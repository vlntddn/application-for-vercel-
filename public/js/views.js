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
} from './state.js';
import { el, clear, fmtTime, fmtDate, titleCase } from './ui.js';
import { CHAPTER_CATEGORY } from './theory-map.js';
import { playCorrect, playWrong } from './sound.js';

const EXAM_QUESTIONS = 30;
const EXAM_SECONDS = 20 * 60;
const EXAM_MAX_ERRORS = 3;
const PRACTICE_BATCH = 20;

function errorBanner(err) {
  return el('p.error-banner', { role: 'alert' }, err.message.toUpperCase());
}

function lang() {
  return state.progress.profile.language || 'en';
}

function translationOf(question) {
  return question.translations?.[lang()]?.text || '';
}

/** Picks the user's language from a {en,ru,zh} object, falling back to EN. */
function loc(obj) {
  return obj?.[lang()] || obj?.en || '';
}

/** Session queue: unseen questions first, then current mistakes, then the rest. */
function pickQueue(questions, count) {
  const answers = state.progress.answers;
  const unseen = questions.filter((q) => !answers[q.id]);
  const wrong = questions.filter((q) => answers[q.id] && !answers[q.id].lastCorrect);
  const rest = questions.filter((q) => answers[q.id]?.lastCorrect);
  return [...shuffle(unseen), ...shuffle(wrong), ...shuffle(rest)].slice(0, count);
}

function masteryOf(slug, count) {
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
function categoryStats() {
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
 * Modal describing one road sign. The description is built from the
 * question bank itself: TRUE statements about this sign are factual
 * "what it means" sentences. onPractice starts a session with all of
 * the sign's questions.
 */
function showSignModal(imageUrl, signQuestions, onPractice) {
  const facts = signQuestions.filter((q) => q.is_true).slice(0, 4);
  let revealed = false;

  const overlay = el('div.modal-overlay', {
    onclick: (e) => { if (e.target === overlay) close(); },
  });

  function close() {
    document.removeEventListener('keydown', escHandler);
    overlay.remove();
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
}

/* ============================== ONBOARDING ============================== */

export function renderOnboarding(root, onDone) {
  let step = 0;
  let name = state.progress.profile.name;
  let language = state.progress.profile.language;

  function draw() {
    const steps = el('div.steps', {},
      el('span', { className: step >= 0 ? 'done' : '' }),
      el('span', { className: step >= 1 ? 'done' : '' }),
    );

    if (step === 0) {
      const nameInput = el('input', {
        id: 'ob-name', type: 'text', maxLength: 40, value: name,
        placeholder: 'Enter your name',
      });
      const langSelect = el('select', { id: 'ob-lang' },
        el('option', { value: 'en', textContent: 'ENGLISH' }),
        el('option', { value: 'ru', textContent: 'РУССКИЙ' }),
        el('option', { value: 'zh', textContent: '中文' }),
      );
      langSelect.value = language;
      clear(root, el('div.onboard', {},
        el('div.panel', {},
          steps,
          el('h1', {}, 'Welcome!'),
          el('p.lede', {}, "Let's set up your study experience."),
          el('div.field', {}, el('label', { htmlFor: 'ob-name' }, 'YOUR NAME'), nameInput),
          el('div.field', {}, el('label', { htmlFor: 'ob-lang' }, 'TRANSLATION LANGUAGE'), langSelect),
          el('div.actions', {},
            el('button.btn.btn-primary.btn-big', {
              onclick: () => {
                name = nameInput.value.trim();
                language = langSelect.value;
                step = 1;
                draw();
              },
            }, 'CONTINUE →'),
          ),
        ),
      ));
      nameInput.focus();
    } else {
      clear(root, el('div.onboard', {},
        el('div.panel', {},
          steps,
          el('h1', {}, 'Before you start'),
          el('p.lede', {}, 'A few things to know about how this app works.'),
          el('div.row', {}, el('div', {},
            el('strong', {}, 'QUESTIONS IN ITALIAN'), el('p.stat-sub', {},
              'The real exam is in Italian. Translations are a study aid — learn the original wording.'))),
          el('div.row', {}, el('div', {},
            el('strong', {}, 'PROGRESS SAVED LOCALLY'), el('p.stat-sub', {},
              'Everything is stored on this machine by the local server. No accounts, no cloud.'))),
          el('div.row', {}, el('div', {},
            el('strong', {}, 'EXAM RULES'), el('p.stat-sub', {},
              `${EXAM_QUESTIONS} questions, ${EXAM_SECONDS / 60} minutes, maximum ${EXAM_MAX_ERRORS} errors to pass.`))),
          el('div.actions', {},
            el('button.btn', { onclick: () => { step = 0; draw(); } }, '← BACK'),
            el('button.btn.btn-primary.btn-big', {
              onclick: async () => {
                try {
                  await api.updateProfile({ name, language, onboarded: true });
                  state.progress.profile = { ...state.progress.profile, name, language, onboarded: true };
                  onDone();
                } catch (err) {
                  root.prepend(errorBanner(err));
                }
              },
            }, 'START LEARNING →'),
          ),
        ),
      ));
    }
  }

  draw();
}

/* ============================== DASHBOARD ============================== */

export function renderDashboard(root) {
  const { profile, stats, exams } = state.progress;
  const total = state.manifest.totalQuestions;
  const masteredPct = Math.round((stats.mastered / total) * 100);
  const recentExams = [...exams].slice(-5).reverse();

  clear(root,
    el('h1', {}, profile.name ? `CIAO, ${profile.name}` : 'CIAO'),
    el('p.lede', {}, 'READY FOR THE EXAM? KEEP THE STREAK ALIVE.'),
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
        el('div.bar', {}, el('div', { style: `width:${masteredPct}%` })),
      ),
      el('div.card', {},
        el('h2', {}, 'EXAM SUCCESS'),
        el('p.stat-value', {}, `${stats.examSuccess}%`),
        el('p.stat-sub', {}, `${stats.examsPassed}/${stats.examsTaken} MOCK EXAMS PASSED`),
      ),
    ),
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

/* ============================== STATISTICS ============================== */

export function renderStats(root) {
  const { stats, exams, answers } = state.progress;
  const total = state.manifest.totalQuestions;
  const cats = categoryStats();

  // Overall accuracy across every attempt ever made.
  let allCorrect = 0;
  let allTotal = 0;
  for (const a of Object.values(answers)) {
    allCorrect += a.correct;
    allTotal += a.correct + a.wrong;
  }
  const overallAccuracy = allTotal ? Math.round((allCorrect / allTotal) * 100) : null;
  const attempted = Object.keys(answers).length;
  const coveragePct = Math.round((attempted / total) * 100);

  // Weak spots: attempted topics with the lowest accuracy first.
  const weak = cats
    .filter((c) => c.attempted > 0 && c.accuracy !== null)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);

  // All topics ranked by how much is left to master.
  const ranked = [...cats].sort((a, b) => a.masteredPct - b.masteredPct);

  const recentExams = [...exams].slice(-12);
  const maxErrors = Math.max(EXAM_MAX_ERRORS + 1, ...recentExams.map((e) => e.errors), 1);

  function accTag(acc) {
    if (acc === null) return el('span.tag', {}, 'NOT TRIED');
    const cls = acc >= 90 ? 'ok' : acc >= 70 ? 'warn' : 'bad';
    return el('span.tag', { className: `tag ${cls}` }, `${acc}%`);
  }

  clear(root,
    el('div.quiz-head', {},
      el('h1', { style: 'margin:0' }, 'PROGRESS & STATS'),
      el('a.btn', { href: '#/' }, '← DASHBOARD'),
    ),
    el('p.lede', {}, 'WHERE YOU STAND AND WHAT TO STUDY NEXT.'),

    el('div.grid.grid-3', {},
      el('div.card', {},
        el('h2', {}, 'MASTERED'),
        el('p.stat-value.ok', {}, `${Math.round((stats.mastered / total) * 100)}%`),
        el('p.stat-sub', {}, `${stats.mastered} OF ${total} QUESTIONS`),
        el('div.bar', {}, el('div', { style: `width:${Math.round((stats.mastered / total) * 100)}%` })),
      ),
      el('div.card', {},
        el('h2', {}, 'OVERALL ACCURACY'),
        el('p.stat-value', {}, overallAccuracy === null ? '—' : `${overallAccuracy}%`),
        el('p.stat-sub', {}, `${attempted} QUESTIONS TRIED (${coveragePct}% COVERAGE)`),
      ),
      el('div.card', {},
        el('h2', {}, 'EXAM SUCCESS'),
        el('p.stat-value.accent', {}, `${stats.examSuccess}%`),
        el('p.stat-sub', {}, `${stats.examsPassed}/${stats.examsTaken} PASSED · STREAK ${stats.streak}`),
      ),
    ),

    weak.length
      ? el('div.panel', {},
          el('h2', {}, 'WEAK SPOTS — STUDY THESE FIRST'),
          ...weak.map((c) =>
            el('div.row', {},
              el('div', { style: 'flex:1' },
                el('strong', {}, titleCase(c.name)),
                el('p.stat-sub', {}, `MASTERED ${c.masteredPct}% · ${c.attempted}/${c.count} TRIED`),
              ),
              accTag(c.accuracy),
              el('a.btn.btn-small', { href: `#/practice/${c.slug}` }, 'PRACTICE'),
            ),
          ),
        )
      : el('div.panel', {},
          el('h2', {}, 'WEAK SPOTS'),
          el('p.empty-note', {}, 'ANSWER SOME QUESTIONS AND YOUR WEAK TOPICS WILL SHOW UP HERE.'),
          el('div.actions', {}, el('a.btn.btn-primary', { href: '#/practice' }, 'START PRACTICE')),
        ),

    recentExams.length
      ? el('div.panel', {},
          el('h2', {}, 'MOCK-EXAM TREND'),
          el('p.stat-sub', { style: 'margin-bottom:12px' },
            `ERRORS PER EXAM · PASS LINE AT ${EXAM_MAX_ERRORS} (LATEST ${recentExams.length})`),
          el('div.exam-trend', {},
            ...recentExams.map((e) =>
              el('div.trend-col', { title: `${e.errors} errors` },
                el('div.trend-bar', {
                  className: `trend-bar ${e.passed ? 'ok' : 'bad'}`,
                  style: `height:${Math.max(6, Math.round((e.errors / maxErrors) * 100))}%`,
                }),
                el('span.trend-label', {}, String(e.errors)),
              ),
            ),
          ),
        )
      : null,

    el('div.panel', {},
      el('h2', {}, 'ALL TOPICS'),
      ...ranked.map((c) =>
        el('div.row', {},
          el('div', { style: 'flex:1' },
            el('strong', {}, titleCase(c.name)),
            el('div.bar', {}, el('div', { style: `width:${c.masteredPct}%` })),
          ),
          el('span.stat-sub', { style: 'min-width:110px;text-align:right' },
            `${c.masteredPct}% · ${c.attempted}/${c.count}`),
          accTag(c.accuracy),
        ),
      ),
    ),
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
      el('div.bar', {}, el('div', { style: `width:${readPct}%` })),
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
                el('div.bar', {}, el('div', { style: `width:${m.pct}%` })),
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
            el('div.bar', {}, el('div', { style: `width:${m.pct}%` })),
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

/* ============================== DICTIONARY ============================== */

export async function renderDictionary(root, sectionId) {
  clear(root, el('h1', {}, 'DIZIONARIO'), el('p.lede', {}, 'LOADING...'));
  let dictionary;
  try {
    dictionary = await loadDictionary();
  } catch (err) {
    return clear(root, errorBanner(err));
  }

  // Self-test mode hides every translation; tap a row to reveal just it.
  let selfTest = false;
  const revealedTerms = new Set();

  function termRow(sec, idx, term) {
    const key = `${sec.id}:${idx}`;
    const hidden = selfTest && !revealedTerms.has(key);
    return el('div.row.term-row', {
      className: `row term-row ${hidden ? 'is-hidden' : ''}`,
      onclick: hidden ? () => { revealedTerms.add(key); draw(); } : undefined,
    },
      el('strong.term-it', {}, term.it),
      hidden
        ? el('span.term-veil', {}, 'TAP TO REVEAL')
        : el('span.term-tr', {}, term[lang()] || term.en),
    );
  }

  function draw() {
    clear(root,
      el('h1', {}, 'DIZIONARIO'),
      el('p.lede', {}, 'THE EXAM VOCABULARY, BY TOPIC. LEARN THE ITALIAN TERM — THE EXAM HAS NO TRANSLATIONS.'),
      el('div.actions', { style: 'margin:0 0 24px' },
        el('a.btn', { href: '#/theory' }, '← THEORY'),
        el('button.btn', {
          className: `btn ${selfTest ? 'btn-primary' : ''}`,
          onclick: () => { selfTest = !selfTest; revealedTerms.clear(); draw(); },
        }, selfTest ? 'SELF-TEST: ON' : 'SELF-TEST: OFF'),
      ),
      ...dictionary.sections.map((sec) =>
        el('div.panel', { id: `dict-${sec.id}` },
          el('div.quiz-head', {},
            el('h2', { style: 'margin:0' }, sec.title_it),
            el('span.tag', {}, `${sec.terms.length} TERMS`),
          ),
          el('p.stat-sub', { style: 'margin-bottom:10px' }, (sec.titles?.[lang()] || '').toUpperCase()),
          ...sec.terms.map((t, i) => termRow(sec, i, t)),
        ),
      ),
    );
    if (sectionId) {
      document.getElementById(`dict-${sectionId}`)?.scrollIntoView({ block: 'start' });
      sectionId = null; // only on first draw
    }
  }

  draw();
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
          el('div.bar', {}, el('div', { style: `width:${pct}%` })),
        );
      }),
    ),
  );
}

/**
 * Renders the translation area: hidden behind a button by default so the
 * user engages with the Italian original first (the exam has no translations).
 */
function translationArea(translation, revealed, onReveal) {
  if (!translation) return null;
  if (revealed) return el('div.question-translation', {}, translation);
  return el('button.btn.btn-small.btn-translate', { onclick: onReveal },
    `TRANSLATE (${lang().toUpperCase()})`);
}

/** Practice session over a queue of questions with instant feedback. */
export function renderQuizSession(root, questions, { title, backHash, onFinish, onQuit }) {
  const queue = questions;
  let index = 0;
  let correctCount = 0;
  let answered = false;
  let lastCorrect = null;
  let revealed = false; // translation visibility, reset per question

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
    const q = queue[index];
    lastCorrect = value === q.is_true;
    if (lastCorrect) correctCount++;
    if (lastCorrect) playCorrect(); else playWrong();
    draw();
    if (!lastCorrect) root.querySelector('.question-card')?.classList.add('shake');
    try {
      state.progress = await api.recordAnswers([{ id: q.id, correct: lastCorrect }]);
    } catch (err) {
      root.prepend(errorBanner(err));
    }
  }

  function next() {
    answered = false;
    lastCorrect = null;
    revealed = false;
    index++;
    if (index >= queue.length) {
      document.removeEventListener('keydown', keyHandler);
      onFinish(correctCount, queue.length);
    } else {
      draw();
    }
  }

  function draw() {
    const q = queue[index];
    clear(root,
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
        el('span.quiz-progress', {}, `${title} — ${index + 1}/${queue.length}`),
        el('span.tag.ok', {}, `${correctCount} CORRECT`),
      ),
      el('div.panel.question-card', {},
        q.image_url ? el('img.question-img', { src: q.image_url, alt: 'Road sign / situation', onerror: (e) => e.target.remove() }) : null,
        el('p.question-text', {}, q.text_it),
        translationArea(translationOf(q), revealed, reveal),
        answered
          ? el('div', {},
              el('div.feedback', { className: `feedback ${lastCorrect ? 'ok' : 'bad'}` },
                lastCorrect ? 'CORRECT' : `WRONG — THE ANSWER IS ${q.is_true ? 'VERO' : 'FALSO'}`),
              el('div.actions', {},
                el('button.btn.btn-primary.btn-big', { onclick: next },
                  index + 1 >= queue.length ? 'FINISH' : 'NEXT →'),
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

  renderQuizSession(root, pickQueue(questions, PRACTICE_BATCH), {
    title: titleCase(cat.name).toUpperCase(),
    backHash: '#/practice',
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

/* ============================== SEARCH ============================== */

/** Strips accents so "puo" matches "può" and vice versa. */
function fold(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Full-text search across the whole bank (Italian + the user's
 * translation language). Results can be practiced as a session.
 */
export async function renderSearch(root) {
  clear(root, el('h1', {}, 'SEARCH'), el('p.lede', {}, 'LOADING THE QUESTION BANK...'));
  let all;
  try {
    all = await loadAllQuestions();
  } catch (err) {
    return clear(root, errorBanner(err));
  }

  let query = '';
  let results = [];
  const revealedAnswers = new Set();

  function search() {
    const q = fold(query.trim());
    if (q.length < 3) { results = []; return; }
    results = all.filter((question) =>
      fold(question.text_it).includes(q) || fold(translationOf(question)).includes(q),
    ).slice(0, 60);
  }

  const input = el('input', {
    id: 'search-input',
    type: 'search',
    placeholder: 'e.g. precedenza, tunnel, дистанция…',
    autocomplete: 'off',
    oninput: (e) => {
      query = e.target.value;
      revealedAnswers.clear();
      search();
      drawResults();
    },
  });

  const resultsBox = el('div', {});

  function startPractice() {
    renderQuizSession(root, shuffle(results).slice(0, PRACTICE_BATCH), {
      title: 'SEARCH PRACTICE',
      backHash: '#/search',
      onQuit: () => renderSearch(root),
      onFinish: () => renderSearch(root),
    });
  }

  function drawResults() {
    const q = fold(query.trim());
    if (q.length < 3) {
      resultsBox.replaceChildren(
        el('p.empty-note', {}, 'TYPE AT LEAST 3 CHARACTERS. SEARCH COVERS ITALIAN AND YOUR LANGUAGE.'),
      );
      return;
    }
    if (!results.length) {
      resultsBox.replaceChildren(el('p.empty-note', {}, `NOTHING FOUND FOR «${query.trim().toUpperCase()}»`));
      return;
    }
    resultsBox.replaceChildren(
      el('div.quiz-head', {},
        el('span.tag', {}, `${results.length}${results.length === 60 ? '+' : ''} RESULTS`),
        el('button.btn.btn-small.btn-primary', { onclick: startPractice },
          `PRACTICE THESE (${Math.min(results.length, PRACTICE_BATCH)})`),
      ),
      ...results.map((question, i) =>
        el('div.row', {},
          question.image_url
            ? el('img.search-sign', { src: question.image_url, alt: '', loading: 'lazy' })
            : null,
          el('span', { style: 'flex:1' }, question.text_it),
          revealedAnswers.has(i)
            ? el('span.tag', { className: `tag ${question.is_true ? 'ok' : 'bad'}` },
                question.is_true ? 'VERO' : 'FALSO')
            : el('button.btn.btn-small', {
                onclick: () => { revealedAnswers.add(i); drawResults(); },
              }, 'ANSWER'),
        ),
      ),
    );
  }

  clear(root,
    el('div.quiz-head', {},
      el('h1', { style: 'margin:0' }, 'SEARCH'),
      el('a.btn', { href: '#/practice' }, '← PRACTICE'),
    ),
    el('p.lede', {}, `ALL ${all.length} QUESTIONS. FIND A WORDING, CHECK THE ANSWER, PRACTICE THE RESULTS.`),
    el('div.panel', {},
      el('div.field', { style: 'margin:0' },
        el('label', { htmlFor: 'search-input' }, 'FIND IN QUESTIONS'),
        input,
      ),
    ),
    el('div.panel', {}, resultsBox),
  );
  drawResults();
  input.focus();
}

/* ============================== EXAM ============================== */

export async function renderExam(root) {
  clear(root,
    el('h1', {}, 'MOCK EXAM'),
    el('div.panel', {},
      el('h2', {}, 'OFFICIAL FORMAT'),
      el('p.lede', {},
        `${EXAM_QUESTIONS} RANDOM QUESTIONS · ${EXAM_SECONDS / 60} MINUTES · MAX ${EXAM_MAX_ERRORS} ERRORS TO PASS. UNANSWERED COUNTS AS WRONG.`),
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

  const timerEl = el('span.timer', {}, fmtTime(secondsLeft));
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
    try {
      await api.recordExam({ total: questions.length, errors, passed });
      state.progress = await api.recordAnswers(
        questions.map((q, i) => ({ id: q.id, correct: chosen[i] === q.is_true })),
      );
    } catch (err) {
      root.prepend(errorBanner(err));
    }

    const wrongOnes = questions.filter((q, i) => chosen[i] !== q.is_true);
    clear(root,
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

/* ============================== SETTINGS ============================== */

/**
 * Warms the service-worker cache with every study asset: topic lists,
 * theory, dictionary, all question files and every sign image. Fetches
 * go through the SW's stale-while-revalidate handler, which stores them.
 */
async function downloadForOffline(button) {
  const box = button.parentElement;
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    box.replaceChildren(el('p.error-banner', { role: 'alert' },
      'OFFLINE CACHE NOT READY — RELOAD THE PAGE ONCE AND TRY AGAIN.'));
    return;
  }
  const label = el('span.tag', {}, 'PREPARING...');
  box.replaceChildren(label);
  try {
    const dataUrls = [
      '/api/manifest', '/api/theory', '/api/dictionary', '/api/lessons',
      ...state.manifest.categories.map((c) => `/api/questions/${c.slug}`),
    ];
    const images = new Set();
    let done = 0;
    for (const url of dataUrls) {
      const res = await fetch(url);
      if (url.startsWith('/api/questions/')) {
        for (const q of await res.json()) if (q.image_url) images.add(q.image_url);
      }
      label.textContent = `DATA ${++done}/${dataUrls.length}`;
    }
    const imageList = [...images];
    done = 0;
    // modest concurrency so the UI stays readable and the server happy
    const workers = Array.from({ length: 8 }, async () => {
      while (imageList.length) {
        const url = imageList.pop();
        await fetch(url).catch(() => {});
        done += 1;
        if (done % 20 === 0 || done === images.size) {
          label.textContent = `IMAGES ${done}/${images.size}`;
        }
      }
    });
    await Promise.all(workers);
    box.replaceChildren(el('span.tag.ok', {}, 'READY FOR OFFLINE USE'));
  } catch (err) {
    box.replaceChildren(errorBanner(err));
  }
}

export function renderSettings(root) {
  const { profile } = state.progress;
  const nameInput = el('input', { id: 's-name', type: 'text', maxLength: 40, value: profile.name });
  const langSelect = el('select', { id: 's-lang' },
    el('option', { value: 'en', textContent: 'ENGLISH' }),
    el('option', { value: 'ru', textContent: 'РУССКИЙ' }),
    el('option', { value: 'zh', textContent: '中文' }),
  );
  langSelect.value = profile.language;
  const themeSelect = el('select', { id: 's-theme' },
    el('option', { value: 'light', textContent: 'LIGHT' }),
    el('option', { value: 'dark', textContent: 'DARK' }),
  );
  themeSelect.value = profile.theme;
  const soundSelect = el('select', { id: 's-sound' },
    el('option', { value: 'on', textContent: 'ON' }),
    el('option', { value: 'off', textContent: 'OFF' }),
  );
  soundSelect.value = profile.sound === false ? 'off' : 'on';

  clear(root,
    el('h1', {}, 'SETTINGS'),
    el('div.panel', {},
      el('h2', {}, 'PROFILE'),
      el('div.field', {}, el('label', { htmlFor: 's-name' }, 'YOUR NAME'), nameInput),
      el('div.field', {}, el('label', { htmlFor: 's-lang' }, 'TRANSLATION LANGUAGE'), langSelect),
      el('div.field', {}, el('label', { htmlFor: 's-theme' }, 'THEME'), themeSelect),
      el('div.field', {}, el('label', { htmlFor: 's-sound' }, 'ANSWER SOUNDS'), soundSelect),
      el('div.actions', {},
        el('button.btn.btn-primary', {
          onclick: async (e) => {
            try {
              const { profile: updated } = await api.updateProfile({
                name: nameInput.value,
                language: langSelect.value,
                theme: themeSelect.value,
                sound: soundSelect.value === 'on',
              });
              state.progress.profile = updated;
              applyTheme();
              renderSettings(root);
            } catch (err) {
              e.target.closest('.panel').prepend(errorBanner(err));
            }
          },
        }, 'SAVE'),
      ),
    ),
    el('div.panel', {},
      el('h2', {}, 'OFFLINE MODE'),
      el('p.lede', {}, 'DOWNLOAD THE WHOLE QUESTION BANK, THEORY AND SIGN IMAGES (~8 MB) TO STUDY WITHOUT INTERNET.'),
      el('div.actions', { id: 'offline-actions' },
        el('button.btn.btn-primary', { onclick: (e) => downloadForOffline(e.target) }, 'DOWNLOAD FOR OFFLINE'),
      ),
    ),
    el('div.panel', {},
      el('h2', {}, 'DANGER ZONE'),
      el('p.lede', {}, 'RESET WIPES ALL ANSWERS, MISTAKES, EXAMS AND STREAK. THERE IS NO UNDO.'),
      el('div.actions', {},
        el('button.btn', {
          onclick: async (e) => {
            if (!confirm('Reset ALL progress? This cannot be undone.')) return;
            try {
              state.progress = await api.resetProgress();
              applyTheme();
              location.hash = '#/';
            } catch (err) {
              e.target.closest('.panel').prepend(errorBanner(err));
            }
          },
        }, 'RESET ALL PROGRESS'),
      ),
    ),
  );
}
