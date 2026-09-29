// Practice screens (Sprint 1, S1.11): intro queue, topic list, quiz session,
// per-topic session. Verbatim move from views.js.
import {
  state,
  loadLessons,
  loadQuestions,
  slugForQuestionId,
  shuffle,
  recordAnswersResilient,
} from '../state.js';
import { el, clear, titleCase, svgIcon } from '../ui.js';
import { CATEGORY_CHAPTER } from '../theory-map.js';
import { playCorrect, playWrong } from '../sound.js';
import { errorBanner, translationOf, loc, pickQueue, queueOrder, masteryOf, categoryStats, translationArea, PRACTICE_BATCH } from './common.js';

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


export function renderPracticeList(root) {
  const answers = state.progress.answers;
  clear(root,
    el('h1', {}, 'PRACTICE'),
    el('p.lede', {}, 'Pick a topic. Unseen and wrong questions come first.'),
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
          el('p.stat-sub', {}, `${mastered}/${cat.count} mastered (${pct}%)`),
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
  let chosenValue = null; // the answer the learner picked (for button states)
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
  // S2.7: the fixed bottom bar hides while a session is running so it never
  // covers the VERO/FALSO buttons on small phones.
  document.body.classList.add('in-session');
  // Leaving the page (nav links, QUIT) must detach the session's key handler.
  window.addEventListener('hashchange', () => {
    document.removeEventListener('keydown', keyHandler);
    document.body.classList.remove('in-session');
  }, { once: true });

  async function answer(value) {
    if (answered) return;
    answered = true;
    chosenValue = value;
    const q = questions[index];
    lastCorrect = value === q.is_true;
    if (lastCorrect) correctCount++;
    if (lastCorrect) playCorrect(); else playWrong();
    draw();
    root.querySelector('.btn-primary')?.focus();
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
    chosenValue = null;
    revealed = false;
    index++;
    if (index >= questions.length) {
      document.removeEventListener('keydown', keyHandler);
      document.body.classList.remove('in-session');
      onFinish(correctCount, questions.length);
    } else {
      draw();
    }
  }

  function answerButtons(q) {
    // Rest state: both buttons neutral (no colour hint). After the answer the
    // picked one shows ok/bad + a word; if the learner was wrong the other
    // button (the correct one) gets the dashed "Right answer" reveal.
    const btn = (value, icon, label) => {
      let state = '';
      let word = null;
      const picked = chosenValue === value;
      const isRight = value === q.is_true;
      if (answered) {
        if (picked && lastCorrect) { state = 'ds-answer--ok'; word = 'Correct'; }
        else if (picked && !lastCorrect) { state = 'ds-answer--bad'; word = 'Wrong'; }
        else if (!picked && !lastCorrect && isRight) { state = 'ds-answer--reveal'; word = 'Right answer'; }
      }
      return el('button', {
        type: 'button',
        className: `ds-answer ${value ? 'btn-true' : 'btn-false'}${state ? ` ${state}` : ''}`,
        'aria-pressed': answered ? picked : null,
        disabled: answered,
        onclick: answered ? undefined : () => answer(value),
      },
        svgIcon(icon), label,
        word ? el('span.ds-answer__state', {}, word) : null);
    };
    return el('div.ds-answers', {}, btn(true, 'check', 'VERO'), btn(false, 'cross', 'FALSO'));
  }

  function draw() {
    const q = questions[index];
    clear(root,
      offline
        ? el('p.offline-note', { role: 'status' },
            'Offline — answers saved on this device, will sync when the server is back')
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
        answerButtons(q),
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
          : el('p.kbd-hint', {},
              el('kbd', {}, 'V'), ' VERO · ', el('kbd', {}, 'F'), ' FALSO · ', el('kbd', {}, 'T'), ' TRANSLATE'),
      ),
    );
  }

  draw();
}

export async function renderPracticeSession(root, slug) {
  const cat = state.manifest.categories.find((c) => c.slug === slug);
  if (!cat) return clear(root, el('p.empty-note', {}, 'Topic not found'));
  clear(root, el('h1', {}, titleCase(cat.name)), el('p.lede', {}, 'Loading questions...'));

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
    title: titleCase(cat.name),
    backHash: '#/practice',
    easyStart: intro !== null,
    onFinish: (correct, total) => {
      clear(root,
        el('div.panel', { style: 'text-align:center' },
          el('h1', {}, 'Session complete'),
          el('p.stat-value.ok', {}, `${correct}/${total}`),
          el('p.lede', {}, 'Correct answers'),
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
