import { api } from './api.js';
import {
  state,
  applyTheme,
  loadTheory,
  loadQuestions,
  loadAllQuestions,
  slugForQuestionId,
  shuffle,
} from './state.js';
import { el, clear, fmtTime, fmtDate, titleCase } from './ui.js';

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
        el('a.btn', { href: '#/practice' }, 'PRACTICE BY TOPIC'),
        el('a.btn', { href: '#/theory' }, 'READ THEORY'),
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
  clear(root,
    el('h1', {}, 'THEORY MANUAL'),
    el('p.lede', {}, `${read.size}/${chapters.length} CHAPTERS READ`),
    el('div.grid.grid-2', {},
      ...chapters.map((ch) =>
        el('a.card', { href: `#/theory/${ch.id}` },
          el('div.quiz-head', {},
            el('span.tag', {}, `CHAPTER ${ch.chapter}`),
            read.has(ch.id) ? el('span.tag.ok', {}, 'READ') : el('span.tag', {}, 'NEW'),
          ),
          el('h2', {}, ch.translations?.[lang()]?.title || ch.title_it),
          el('p.stat-sub', {}, ch.title_it),
        ),
      ),
    ),
  );
}

export async function renderTheoryChapter(root, id) {
  let chapters;
  try {
    chapters = await loadTheory();
  } catch (err) {
    return clear(root, errorBanner(err));
  }
  const ch = chapters.find((c) => c.id === id);
  if (!ch) return clear(root, el('p.empty-note', {}, 'CHAPTER NOT FOUND'));
  const tr = ch.translations?.[lang()];
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

  function draw() {
  clear(root,
    el('a.btn', { href: '#/theory' }, '← ALL CHAPTERS'),
    el('h1', { style: 'margin-top:20px' }, `${ch.chapter}. ${ch.title_it}`),
    tr?.title && revealed ? el('p.lede', {}, tr.title.toUpperCase()) : null,
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
    el('div.actions', {},
      state.progress.theoryRead.includes(ch.id)
        ? el('span.tag.ok', {}, 'MARKED AS READ')
        : el('button.btn.btn-primary', {
            onclick: async (e) => {
              try {
                const { theoryRead } = await api.markTheoryRead(ch.id);
                state.progress.theoryRead = theoryRead;
                draw();
              } catch (err) {
                e.target.replaceWith(errorBanner(err));
              }
            },
          }, 'MARK AS READ'),
    ),
  );
  }

  draw();
}

/* ============================== PRACTICE ============================== */

export function renderPracticeList(root) {
  const answers = state.progress.answers;
  clear(root,
    el('h1', {}, 'PRACTICE'),
    el('p.lede', {}, 'PICK A TOPIC. UNSEEN AND WRONG QUESTIONS COME FIRST.'),
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
export function renderQuizSession(root, questions, { title, backHash, onFinish }) {
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
    draw();
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
        el('a.btn', { href: backHash, onclick: () => document.removeEventListener('keydown', keyHandler) }, '← QUIT'),
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

  const answers = state.progress.answers;
  const unseen = questions.filter((q) => !answers[q.id]);
  const wrong = questions.filter((q) => answers[q.id] && !answers[q.id].lastCorrect);
  const rest = questions.filter((q) => answers[q.id]?.lastCorrect);
  const queue = [...shuffle(unseen), ...shuffle(wrong), ...shuffle(rest)].slice(0, PRACTICE_BATCH);

  renderQuizSession(root, queue, {
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

  clear(root,
    el('h1', {}, 'SETTINGS'),
    el('div.panel', {},
      el('h2', {}, 'PROFILE'),
      el('div.field', {}, el('label', { htmlFor: 's-name' }, 'YOUR NAME'), nameInput),
      el('div.field', {}, el('label', { htmlFor: 's-lang' }, 'TRANSLATION LANGUAGE'), langSelect),
      el('div.field', {}, el('label', { htmlFor: 's-theme' }, 'THEME'), themeSelect),
      el('div.actions', {},
        el('button.btn.btn-primary', {
          onclick: async (e) => {
            try {
              const { profile: updated } = await api.updateProfile({
                name: nameInput.value,
                language: langSelect.value,
                theme: themeSelect.value,
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
