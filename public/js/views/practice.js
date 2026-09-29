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
async function whyContents(chapterId, lessonsPromise) {
  let lesson;
  try {
    lesson = (await lessonsPromise).chapters?.[chapterId];
  } catch {
    lesson = null;
  }
  if (!lesson) {
    // No lesson for this chapter yet: just the chapter title, reader can
    // open it from the theory section.
    return null;
  }
  return [
    el('p.why-objective', {}, loc(lesson.objective)),
    ...(lesson.mustKnow || []).slice(0, 4).map((fact) =>
      el('div.why-fact', {},
        el('strong', {}, fact.fact_it),
        el('span.tag.must-value', {}, fact.value.toUpperCase()),
      ),
    ),
  ];
}

export function renderQuizSession(root, questions, { title, backHash, onFinish, onQuit, easyStart }) {
  let index = 0;
  let correctCount = 0;
  let answered = false;
  let lastCorrect = null;
  let chosenValue = null; // the answer the learner picked (for button states)
  let revealed = false; // translation visibility, reset per question
  let offline = false; // answers are queuing locally
  let lessonsPromise = null; // session cache: loadLessons() once per session
  let feedbackPanel = null; // built once per question, reset in next()

  function lessons() {
    if (!lessonsPromise) lessonsPromise = loadLessons();
    return lessonsPromise;
  }

  /** S2.9: the "why" content, shown directly under the verdict. Same
   *  chapter facts as the old expandable WHY? block — no new explanations. */
  async function whyBlock(question) {
    const slug = slugForQuestionId(question.id);
    const chapterId = slug ? CATEGORY_CHAPTER[slug] : null;
    if (!chapterId) return null;
    const contents = await whyContents(chapterId, lessons());
    if (!contents) return null;
    return el('div.why-block', {}, ...contents);
  }

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
    feedbackPanel?.querySelector('button')?.focus();
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
    feedbackPanel = null;
    index++;
    if (index >= questions.length) {
      document.removeEventListener('keydown', keyHandler);
      document.body.classList.remove('in-session');
      onFinish(correctCount, questions.length);
    } else {
      draw();
    }
  }

  /** S2.9 (components/Feedback): the post-answer panel. Verdict with icon,
   *  the right answer in words when wrong, the same chapter facts the old
   *  WHY? block showed (no invented explanations), and the focused Next
   *  button. Returns the panel so the caller can mount and focus it. */
  function buildFeedbackPanel(q) {
    const panel = el('div', {
      className: `ds-feedback ${lastCorrect ? 'ds-feedback--ok' : 'ds-feedback--bad'}`,
      role: 'status',
    },
      el('div.ds-feedback__head', {},
        svgIcon(lastCorrect ? 'check' : 'cross'),
        lastCorrect ? 'Correct' : 'Not quite'),
      lastCorrect
        ? null
        : el('div.ds-feedback__answer', {}, `Right answer: ${q.is_true ? 'Vero' : 'Falso'}`),
    );
    const whySlot = el('div.why-slot', {});
    panel.append(whySlot);
    const actions = el('div.ds-feedback__actions', {},
      el('button.btn.btn-primary', { onclick: next },
        index + 1 >= questions.length ? 'FINISH' : 'NEXT →'),
    );
    panel.append(actions);
    const atIndex = index; // question the panel was built for

    // Chapter facts: insert when loaded (and still on this question, in case
    // the learner raced ahead) — never hide the explanation behind a tap.
    whyBlock(q).then((block) => {
      if (index === atIndex && whySlot.isConnected && !whySlot.firstChild) {
        whySlot.replaceChildren(block ?? el('span', { style: 'display:none' }));
      }
    });
    return panel;
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
          ? (feedbackPanel ??= buildFeedbackPanel(q))
          : null,
        el('p.kbd-hint', {},
          answered
            ? [el('kbd', {}, 'ENTER'), ' NEXT · ', el('kbd', {}, 'T'), ' TRANSLATE']
            : [el('kbd', {}, 'V'), ' VERO · ', el('kbd', {}, 'F'), ' FALSO · ', el('kbd', {}, 'T'), ' TRANSLATE']),
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
