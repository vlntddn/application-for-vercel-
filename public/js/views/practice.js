// Practice screens (Sprint 1, S1.11): intro queue, topic list, quiz session,
// per-topic session. Verbatim move from views.js.
import {
  state,
  loadLessons,
  loadInsights,
  loadTheory,
  loadQuestions,
  loadDictionary,
  loadExplanations,
  slugForQuestionId,
  recordAnswersResilient,
} from '../state.js';
import { el, clear, svgIcon } from '../ui.js';
import { t } from '../i18n.js';
import { CATEGORY_CHAPTER } from '../theory-map.js';
import { playCorrect, playWrong } from '../sound.js';
import { errorBanner, translationOf, loc, lang, pickQueue, queueOrder, masteryOf, categoryStats, translationArea, PRACTICE_BATCH, feedbackHref } from './common.js';
import {
  introQueue as domainIntroQueue,
  INTRO_QUESTIONS,
  INTRO_TEXT_LEN,
  signalHintsEnabled,
  signalSpans,
  signalGlossary,
  hasSignalWord,
  buildDictionaryTapIndex,
  dictionaryTapTerms,
} from '../domain/learning.js';
import { topicLabel, topicSub } from '../topics.js';

// First-session on-ramp (Phase 2.2): a newcomer's first practice run opens
// with the topic's easiest questions — short text, no sign image — so the
// VERO/FALSO mechanic is felt before the hard wording starts.

/**
 * First-session queue (Phase 2.2 "guaranteed first success").
 * Thin wrapper over domain/learning.js `introQueue` — same options, same
 * null fallback when the topic holds too few easy questions.
 */
export function introQueue(questions, options = {}) {
  return domainIntroQueue(questions, options);
}

export function renderPracticeList(root) {
  const answers = state.progress.answers;
  clear(root,
    el('h1', {}, t('pr.title')),
    el('p.lede', {}, t('pr.lede')),
    el('div.actions', { style: 'margin-bottom:20px' },
      el('a.btn', { href: '#/search' }, t('pr.searchAll')),
    ),
    el('div.grid.grid-2', {},
      ...state.manifest.categories.map((cat, i) => {
        const mastered = Object.entries(answers)
          .filter(([id, a]) => a.lastCorrect && id.startsWith(`${cat.slug}-`)).length;
        const pct = Math.round((mastered / cat.count) * 100);
        return el('a.card', { href: `#/practice/${cat.slug}` },
          el('div.quiz-head', {},
            el('span.tag', {}, t('pr.topicN', { n: i + 1 })),
            mastered === 0 ? el('span.tag', {}, t('pr.new')) : null,
          ),
          el('h2', {}, topicLabel(cat)),
          topicSub(cat) ? el('p.stat-sub', {}, topicSub(cat)) : null,
          el('p.stat-sub', {}, t('pr.mastered', { mastered, total: cat.count, pct })),
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
  let theoryPromise = null; // session cache: loadTheory() once per session
  let feedbackPanel = null; // built once per question, reset in next()

  function lessons() {
    if (!lessonsPromise) lessonsPromise = loadLessons();
    return lessonsPromise;
  }

  function theory() {
    if (!theoryPromise) theoryPromise = loadTheory();
    return theoryPromise;
  }

  /** Q3: the theory title for a chapter id ("ch10" → "Правила движения…"
   *  in the learner's language), falling back to the Italian title. */
  async function chapterTitle(chapterId) {
    try {
      const theory = await theory();
      const chapter = (Array.isArray(theory) ? theory : theory.chapters || []).find?.((c) => c.id === chapterId);
      return chapter?.translations?.[lang()]?.title || chapter?.title_it || null;
    } catch {
      return null;
    }
  }

  // L2 — signal-word highlight (practice/review only, never the exam):
  // first signal occurrence becomes a tappable <mark> that opens a small
  // callout with the word, its translation and its FALSO share in the bank.
  // Disabled by profile.signalHints (`auto` turns off after 100 answers).
  const hintsOn = signalHintsEnabled(state.progress.profile, state.progress.answers);
  let insightsPromise = null; // session cache: loadInsights() once per session
  let signalCache = new Map(); // mark id -> glossary entry (word, falseRatio, gloss)
  let markSeq = 0;

  function signalText(q) {
    if (!hintsOn) return el('p.question-text', { translate: 'no', lang: 'it' }, q.text_it);
    const p = (insightsPromise ??= loadInsights().then((ins) => ({
      words: (ins?.words || []).map((w) => w.word),
      byWord: new Map((ins?.words || []).map((w) => [w.word, w])),
    })).catch(() => ({ words: [], byWord: new Map() })));
    const para = el('p.question-text', { translate: 'no', lang: 'it' }, q.text_it);
    p.then(({ words, byWord }) => {
      if (!para.isConnected || para.children.length > 1) return; // re-rendered
      const segs = signalSpans(q.text_it, words);
      const marked = segs.some((s) => s.mark);
      if (!marked) return;
      // First signal word that actually occurs in this question (spans marks
      // exactly that one) — its insight row is the callout's source of truth.
      const word = words.find((w) => hasSignalWord(q.text_it, w));
      const entry = byWord.get(word) ?? { word };
      const id = `signal-gloss-${markSeq++}`;
      const glossId = `signal-gloss-text-${markSeq++}`;
      const frag = document.createDocumentFragment();
      for (const seg of segs) {
        if (!seg.mark) { frag.append(seg.text); continue; }
        frag.append(el('mark.ds-signal', {
          id,
          role: 'button',
          tabindex: '0',
          'aria-describedby': glossId,
          onclick: (e) => { e.stopPropagation(); openSignalCallout(e.target, entry, para); },
          onkeydown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              openSignalCallout(e.target, entry, para);
            }
          },
        }, seg.text));
      }
      // Hidden gloss region: a11y description of the marked word (translation).
      const glossRegion = el('span', { id: glossId, style: 'display:none' });
      frag.append(glossRegion);
      para.replaceChildren(frag);
      // Translation comes from the exam-Italian lesson — fill lazily so the
      // callout and the a11y region stay in sync with what the user sees.
      lessons().then((ls) => {
        const gloss = (signalGlossary(ls, { words: [...byWord.values()] }) || [])
          .find((g) => g.word === entry.word);
        signalCache.set(id, gloss);
        if (glossRegion.isConnected) glossRegion.textContent = loc(gloss?.gloss) || '';
      });
    });
    return para;
  }

  let openCallout = null; // currently open callout element (one at a time)
  let closeCallout = null; // removes the element AND its document listeners

  function closeSignalCallout() {
    if (openCallout) { openCallout.remove(); openCallout = null; }
    if (closeCallout) { closeCallout(); closeCallout = null; }
  }

  function openSignalCallout(anchor, entry, para) {
    closeSignalCallout();
    const gloss = signalCache.get(anchor.id); // translation (may not be ready yet)
    const falsePct = entry.falseRatio != null
      ? `${Math.round(entry.falseRatio * 100)}%`
      : null;
    const callout = el('div.ds-signal-callout', {
      role: 'status',
      'aria-label': t('pr.signalWordAria', { word: entry.word }),
    },
      el('strong', {}, entry.word),
      el('span.ds-signal-callout__gloss', {}, loc(gloss?.gloss) || '—'),
      falsePct ? el('span.tag.bad', {}, t('pr.falsoShare', { pct: falsePct, n: entry.questions })) : null,
    );
    para.insertAdjacentElement('afterend', callout);
    openCallout = callout;
    // Close on outside tap or Escape.
    const onDocTap = (e) => {
      if (!openCallout?.isConnected) return;
      if (openCallout.contains(e.target) || anchor.contains(e.target)) return;
      closeSignalCallout();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') closeSignalCallout();
    };
    closeCallout = () => {
      document.removeEventListener('click', onDocTap, true);
      document.removeEventListener('keydown', onKey);
    };
    document.addEventListener('click', onDocTap, true);
    document.addEventListener('keydown', onKey);
  }

  // L8 — «Слово по тапу»: any `text_it` word present in the dictionary (by
  // lemma, article-agnostic) becomes a tappable <mark>; the callout shows
  // the translation in the learner's language. Session-scoped index; the
  // dictionary is cached in state, so this costs one fetch at most.
  let tapIndexPromise = null; // resolves to buildDictionaryTapIndex(...)
  let markedTerm = false;

  function tapIndex() {
    if (!tapIndexPromise) {
      tapIndexPromise = loadDictionary()
        .then((d) => buildDictionaryTapIndex(d.sections))
        .catch(() => null);
    }
    return tapIndexPromise;
  }

  function openTermCallout(anchor, term) {
    closeSignalCallout();
    const callout = el('div.ds-term-callout', {
      role: 'status',
      'aria-label': t('pr.translationAria', { word: term.it }),
    },
      el('strong', {}, term.it),
      el('span.ds-term-callout__gloss', {}, term[lang()] || term.en || '—'),
    );
    const card = anchor.closest('.question-card');
    if (card) card.insertAdjacentElement('afterbegin', callout);
    openCallout = callout;
    const onDocTap = (e) => {
      if (!openCallout?.isConnected) return;
      if (openCallout.contains(e.target) || anchor.contains(e.target)) return;
      closeSignalCallout();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') closeSignalCallout();
    };
    closeCallout = () => {
      document.removeEventListener('click', onDocTap, true);
      document.removeEventListener('keydown', onKey);
    };
    document.addEventListener('click', onDocTap, true);
    document.addEventListener('keydown', onKey);
  }

  /**
   * L8 — question text with dictionary-tappable words. Builds plain text
   * first, then (when the index is ready and the paragraph is still the
   * original text node) re-renders it with a `<mark.ds-term>` per matched
   * word. Signal hints are unaffected — if they are on, the signal render
   * owns the paragraph and this one stays out.
   */
  function termText(q) {
    if (hintsOn) return signalText(q);
    const para = el('p.question-text', { translate: 'no', lang: 'it' }, q.text_it);
    tapIndex().then((index) => {
      if (!index || markedTerm || !para.isConnected || para.childNodes.length !== 1
          || para.firstChild.nodeType !== Node.TEXT_NODE) return;
      const hits = dictionaryTapTerms(q.text_it, index);
      if (!hits.length) return;
      markedTerm = true;
      const frag = document.createDocumentFragment();
      let cursor = 0;
      for (const hit of hits) {
        if (hit.start > cursor) frag.append(q.text_it.slice(cursor, hit.start));
        frag.append(el('mark.ds-term', {
          role: 'button',
          tabindex: '0',
          onclick: (e) => { e.stopPropagation(); openTermCallout(e.target, hit.term); },
          onkeydown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              openTermCallout(e.target, hit.term);
            }
          },
        }, q.text_it.slice(hit.start, hit.end)));
        cursor = hit.end;
      }
      if (cursor < q.text_it.length) frag.append(q.text_it.slice(cursor));
      para.replaceChildren(frag);
    });
    return para;
  }

  /** Q3: the chapter's general facts, collapsed into a "more from this
   *  chapter" <details> under the verdict — the specific trap/explanation
   *  comes first, these facts are second-level context. */
  async function whyBlock(question) {
    const slug = slugForQuestionId(question.id);
    const chapterId = slug ? CATEGORY_CHAPTER[slug] : null;
    if (!chapterId) return null;
    const [contents, title] = await Promise.all([
      whyContents(chapterId, lessons()),
      chapterTitle(chapterId),
    ]);
    if (!contents) return null;
    return el('details.why-details', {},
      el('summary.why-details__summary', {},
        title ? t('pr.moreFromChapter', { title }) : t('pr.moreFromChapterPlain')),
      el('div.why-block', {}, ...contents),
    );
  }

  /** Q3: the lesson's trap entry for this exact question (matched by id) —
   *  the most specific explanation we have, shown right after the verdict
   *  on a wrong answer. Missing lesson / no trap for this question → null. */
  async function trapBlock(question) {
    if (lastCorrect) return null;
    const slug = slugForQuestionId(question.id);
    const chapterId = slug ? CATEGORY_CHAPTER[slug] : null;
    if (!chapterId) return null;
    let lesson;
    try {
      lesson = (await lessons()).chapters?.[chapterId];
    } catch {
      lesson = null;
    }
    const trap = (lesson?.traps || []).find((t) => t.id === question.id);
    if (!trap?.why) return null;
    return el('div.why-block.trap-item', {}, el('p.explanation__why', {}, loc(trap.why)));
  }

  /**
   * L9a: the AI-drafted explanation, shown only in a mistake's breakdown and
   * only once the learner has gotten this exact question wrong at least
   * twice (`answers[id].wrong >= 2`). It surfaces the verbatim `key_it`
   * phrase, the explanation in the learner's language, and a link to the
   * chapter — always tagged "AI draft — check the lesson". Never on the
   * exam. Missing file / not yet earned → null.
   */
  async function explanationBlock(question) {
    // Only in a mistake's breakdown; the exam never uses this panel.
    if (lastCorrect) return null;
    // `state.progress.answers` hasn't committed THIS wrong answer yet (it is
    // recorded after draw()), so count it manually: previous wrongs + this one.
    const rec = state.progress.answers?.[question.id];
    const wrongTotal = (rec?.wrong || 0) + 1;
    if (wrongTotal < 2) return null; // show only from the 2nd mistake onward
    const slug = slugForQuestionId(question.id);
    if (!slug) return null;
    const file = await loadExplanations(slug);
    const item = file.items?.[question.id];
    if (!item) return null; // no explanation authored for this question yet
    const title = await chapterTitle(item.chapter);
    return el('div.why-block.explanation', {},
      el('div.explanation__meta', {},
        el('span.tag.warn', {}, t('pr.aiDraft')),
        el('a.explanation__link', { href: `#/theory/${item.chapter}` },
          title || t('pr.chapterN', { n: item.chapter })),
      ),
      el('div.why-fact', {},
        el('strong.explanation__key', {}, `«${item.key_it}»`),
      ),
      el('p.explanation__why', {}, loc(item.why)),
    );
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
    markedTerm = false;
    closeSignalCallout();
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
        lastCorrect ? t('pr.correct') : t('pr.notQuite')),
      lastCorrect
        ? null
        : el('div.ds-feedback__answer', {}, t('pr.rightAnswer', { ans: q.is_true ? 'Vero' : 'Falso' })),
    );
    const explanationSlot = el('div.explanation-slot', {});
    panel.append(explanationSlot);
    const trapSlot = el('div.trap-slot', {});
    panel.append(trapSlot);
    const whySlot = el('div.why-slot', {});
    panel.append(whySlot);
    const actions = el('div.ds-feedback__actions', {},
      el('button.btn.btn-primary', { onclick: next },
        index + 1 >= questions.length ? t('pr.finish') : t('pr.next')),
    );
    panel.append(actions);
    panel.append(el('a.report-link', {
      href: feedbackHref(t('pr.reportSubject', { id: q.id }),
        t('pr.reportBody', { id: q.id, text: q.text_it, ans: q.is_true ? 'VERO' : 'FALSO' })),
    }, t('pr.report')));
    const atIndex = index; // question the panel was built for

    // Q3: specific content first — the L9a explanation (from the 2nd mistake),
    // then the lesson's trap for this exact question — and the chapter's
    // general facts last, collapsed into a <details>. Each slot fills
    // independently when loaded (and still on this question).
    const settle = (promise, slot) => {
      promise.then((block) => {
        if (index === atIndex && slot.isConnected && !slot.firstChild) {
          slot.replaceChildren(block ?? el('span', { style: 'display:none' }));
        }
      }).catch(() => {});
    };
    settle(whyBlock(q), whySlot);
    settle(trapBlock(q), trapSlot);
    settle(explanationBlock(q), explanationSlot);
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
        if (picked && lastCorrect) { state = 'ds-answer--ok'; word = t('pr.correct'); }
        else if (picked && !lastCorrect) { state = 'ds-answer--bad'; word = t('pr.wrong'); }
        else if (!picked && !lastCorrect && isRight) { state = 'ds-answer--reveal'; word = t('pr.rightAnswerTag'); }
      }
      return el('button', {
        type: 'button',
        className: `ds-answer ${value ? 'btn-true' : 'btn-false'}${state ? ` ${state}` : ''}`,
        translate: 'no',
        lang: 'it',
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
        ? el('p.offline-note', { role: 'status' }, t('pr.offline'))
        : null,
      el('div.quiz-head', {},
        el('a.btn', {
          href: backHash,
          onclick: (e) => {
            document.removeEventListener('keydown', keyHandler);
            closeSignalCallout();
            if (onQuit) {
              e.preventDefault();
              onQuit();
            }
          },
        }, t('pr.quit')),
        el('span.quiz-progress', {}, t('pr.progress', { title, current: index + 1, total: questions.length })),
        el('span.tag.ok', {}, t('pr.correct', { n: correctCount })),
        easyStart ? el('span.tag', {}, t('pr.easyStart')) : null,
      ),
      el('div.panel.question-card', {},
        q.image_url ? el('img.question-img', { src: q.image_url, alt: t('pr.imgAlt'), onerror: (e) => e.target.remove() }) : null,
        termText(q),
        translationArea(translationOf(q), revealed, reveal),
        answerButtons(q),
        answered
          ? (feedbackPanel ??= buildFeedbackPanel(q))
          : null,
        el('p.kbd-hint', {},
          answered
            ? [el('kbd', {}, 'ENTER'), t('pr.kbdNext'), el('kbd', {}, 'T'), t('pr.kbdTranslate')]
            : [el('kbd', {}, 'V'), t('pr.kbdTrue'), el('kbd', {}, 'F'), t('pr.kbdFalse'), el('kbd', {}, 'T'), t('pr.kbdTranslate')]),
      ),
    );
  }

  draw();
}

export async function renderPracticeSession(root, slug) {
  const cat = state.manifest.categories.find((c) => c.slug === slug);
  if (!cat) return clear(root, el('p.empty-note', {}, t('pr.topicNotFound')));
  clear(root, el('h1', {}, topicLabel(cat)), el('p.lede', {}, topicSub(cat) || t('pr.loading')));

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
    title: topicLabel(cat),
    backHash: '#/practice',
    easyStart: intro !== null,
    onFinish: (correct, total) => {
      clear(root,
        el('div.panel', { style: 'text-align:center' },
          el('h1', {}, t('pr.sessionComplete')),
          el('p.stat-value.ok', {}, t('pr.score', { correct, total })),
          el('p.lede', {}, t('pr.correctAnswers')),
          el('div.actions', { style: 'justify-content:center' },
            el('a.btn.btn-primary', { href: `#/practice/${slug}`, onclick: () => renderPracticeSession(root, slug) }, t('pr.oneMore')),
            el('a.btn', { href: '#/practice' }, t('pr.allTopics')),
            el('a.btn', { href: '#/' }, t('pr.dashboard')),
          ),
        ),
      );
    },
  });
}
