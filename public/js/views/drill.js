// L1c — Тренажёр «Язык экзамена» (#/drill/signals).
// 20 вопросов банка с сигналами (50/50 FALSO / ВЕРНЫЕ-контрпримеры,
// порядок — доменная функция signalQueue). После ответа — Feedback:
// слово-сигнал выделено + «this word is FALSO in N%» (+ «here it is
// TRUE because …» только если у вопроса есть trap-why в lessons).
import {
  loadInsights,
  loadLessons,
  loadAllQuestions,
  recordAnswersResilient,
} from '../state.js';
import { el, clear, svgIcon } from '../ui.js';
import { playCorrect, playWrong } from '../sound.js';
import { t } from '../i18n.js';
import { errorBanner, translationOf, loc, translationArea, feedbackHref } from './common.js';
import { signalQueue, signalSpans } from '../domain/learning.js';

const DRILL_SIZE = 20;
const PER_SIDE = DRILL_SIZE / 2;

export async function renderSignalDrill(root) {
  clear(root, el('h1', {}, t('dr.title')), el('p.lede', {}, t('dr.loading')));
  let insights, questions;
  try {
    [insights, questions] = await Promise.all([loadInsights(), loadAllQuestions()]);
  } catch (err) {
    return clear(root, errorBanner(err));
  }
  const pool = signalQueue(questions, insights, DRILL_SIZE);
  const falseCount = pool.filter((q) => q.is_true === false).length;
  const trueCount = pool.length - falseCount;
  if (pool.length !== DRILL_SIZE || falseCount !== PER_SIDE || trueCount !== PER_SIDE) {
    return clear(root, errorBanner(new Error(t('dr.poolError'))));
  }

  // trap-why по id вопроса: lessons.chapters[*].traps[] с id === question.id.
  let lessons;
  try { lessons = await loadLessons(); } catch { lessons = null; }
  const trapById = new Map();
  if (lessons) {
    for (const ch of Object.values(lessons.chapters || {})) {
      for (const t of ch.traps || []) trapById.set(t.id, t);
    }
  }
  // Сигнал, который signalQueue уже нашел в вопросе (для доли FALSO).
  const wordOf = (q) =>
    (insights.words || []).find((w) => w.word === q.signalWord) || null;

  const total = pool.length;
  let index = 0, answered = false, chosenValue = null, lastCorrect = null, correctCount = 0;
  let revealed = false, feedbackPanel = null, offline = false;

  const keyHandler = (e) => {
    const key = e.key.toLowerCase();
    if (key === 't') return reveal();
    if (!answered) {
      if (key === 'v' || key === 'arrowleft') answer(true);
      if (key === 'f' || key === 'arrowright') answer(false);
    } else if (key === 'enter' || key === ' ') {
      e.preventDefault();
      next();
    }
  };
  document.addEventListener('keydown', keyHandler);
  document.body.classList.add('in-session');
  window.addEventListener('hashchange', () => {
    document.removeEventListener('keydown', keyHandler);
    document.body.classList.remove('in-session');
  }, { once: true });

  function reveal() {
    if (revealed || !answered) return;
    revealed = true;
    draw();
  }

  async function answer(value) {
    if (answered) return;
    answered = true;
    chosenValue = value;
    const q = pool[index];
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
    answered = false; lastCorrect = null; chosenValue = null;
    revealed = false; feedbackPanel = null; index++;
    if (index >= pool.length) {
      document.removeEventListener('keydown', keyHandler);
      document.body.classList.remove('in-session');
      finish();
    } else draw();
  }

  function finish() {
    clear(root,
      el('div.panel', { style: 'text-align:center' },
        el('h1', {}, t('dr.finishTitle')),
        el('p.stat-value.ok', {}, `${correctCount}/${total}`),
        el('p.lede', {}, t('dr.correctAnswers')),
        el('div.actions', { style: 'justify-content:center' },
          el('a.btn.btn-primary', { href: '#/drill/signals' }, t('dr.oneMore')),
          el('a.btn', { href: '#/exam-italian' }, t('dr.examGuide')),
          el('a.btn', { href: '#/' }, t('pr.dashboard')),
        ),
      ),
    );
  }

  function signalNote(q) {
    const w = wordOf(q);
    if (!w) return null;
    const pct = Math.round(w.falseRatio * 100);
    const nodes = [el('p.signal-ratio', {},
      t('dr.falsoIn', { word: w.word, pct }),
    )];
    const trap = trapById.get(q.id);
    if (trap && q.is_true === true && trap.why) {
      nodes.push(el('p.signal-true', {},
        t('dr.trueBecause', { why: loc(trap.why) }),
      ));
    }
    return el('div.signal-notes', {}, ...nodes);
  }

  function buildFeedbackPanel(q) {
    const panel = el('div', {
      className: `ds-feedback ${lastCorrect ? 'ds-feedback--ok' : 'ds-feedback--bad'}`,
      role: 'status',
    },
      el('div.ds-feedback__head', {},
        svgIcon(lastCorrect ? 'check' : 'cross'),
        lastCorrect ? t('dr.correct') : t('pr.notQuite')),
      lastCorrect
        ? null
        : el('div.ds-feedback__answer', {},
          t('pr.rightAnswer', { ans: q.is_true ? 'Vero' : 'Falso' })),
    );
    const note = signalNote(q);
    if (note) panel.append(note);
    panel.append(
      el('div.ds-feedback__actions', {},
        el('button.btn.btn-primary', { onclick: next },
          index + 1 >= pool.length ? t('dr.finish') : t('dr.next')),
      ),
      el('a.report-link', {
        href: feedbackHref(
          t('pr.reportSubject', { id: q.id }),
          t('pr.reportBody', { id: q.id, text: q.text_it, ans: q.is_true ? 'VERO' : 'FALSO' }),
        ),
      }, t('pr.report')),
    );
    return panel;
  }

  function answerButtons(q) {
    const btn = (value, icon, label) => {
      let stateStr = '';
      let word = null;
      const picked = chosenValue === value;
      const isRight = value === q.is_true;
      if (answered) {
        if (picked && lastCorrect) { stateStr = 'ds-answer--ok'; word = t('dr.correct'); }
        else if (picked && !lastCorrect) { stateStr = 'ds-answer--bad'; word = t('dr.wrong'); }
        else if (!picked && !lastCorrect && isRight) { stateStr = 'ds-answer--reveal'; word = t('dr.rightAnswerTag'); }
      }
      return el('button', {
        type: 'button',
        className: `ds-answer ${value ? 'btn-true' : 'btn-false'}${stateStr ? ` ${stateStr}` : ''}`,
        'aria-pressed': answered ? picked : null,
        disabled: answered,
        onclick: answered ? undefined : () => answer(value),
      },
        svgIcon(icon), label,
        word ? el('span.ds-answer__state', {}, word) : null);
    };
    return el('div.ds-answers', {}, btn(true, 'check', 'VERO'), btn(false, 'cross', 'FALSO'));
  }

  function questionText(q) {
    return signalSpans(q.text_it, q.signalWord ? [q.signalWord] : []).map((s) =>
      s.mark ? el('mark.ds-signal', {}, s.text) : s.text);
  }

  function draw() {
    const q = pool[index];
    clear(root,
      offline
        ? el('p.offline-note', { role: 'status' }, t('pr.offline'))
        : null,
      el('div.quiz-head', {},
        el('a.btn', {
          href: '#/exam-italian',
          onclick: () => document.removeEventListener('keydown', keyHandler),
        }, t('dr.quit')),
        el('span.quiz-progress', {}, t('dr.progress', { current: index + 1, total })),
        el('span.tag.ok', {}, t('dr.correctTag', { n: correctCount })),
      ),
      el('div.panel.question-card', {},
        q.image_url ? el('img.question-img', {
          src: q.image_url, alt: t('pr.imgAlt'),
          onerror: (e) => e.target.remove(),
        }) : null,
        el('p.question-text', {}, ...questionText(q)),
        translationArea(translationOf(q), revealed, reveal),
        answerButtons(q),
        answered ? (feedbackPanel ??= buildFeedbackPanel(q)) : null,
        el('p.kbd-hint', {},
          answered
            ? [el('kbd', {}, 'ENTER'), t('dr.kbdNext'), el('kbd', {}, 'T'), t('dr.kbdTranslate')]
            : [el('kbd', {}, 'V'), t('dr.kbdTrue'), el('kbd', {}, 'F'), t('dr.kbdFalse'), el('kbd', {}, 'T'), t('dr.kbdTranslate')],
        ),
      ),
    );
  }

  draw();
}
