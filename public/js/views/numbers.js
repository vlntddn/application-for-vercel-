// L4 — «Числа, которые надо знать» (#/numbers).
// Two states on one screen:
//   1) the table — every must-know number, grouped by chapter, with the
//      count of bank questions that touch it (data/insights/numbers.json);
//   2) the drill — 20 bank questions containing at least one known number
//      (50/50 FALSO traps / VERO counter-examples, queue = numbersQueue).
// The table is a read-only reference; the drill records answers like the
// other trainers do. START THE DRILL swaps the table for the drill in place.
import {
  loadNumbers,
  loadLessons,
  loadTheory,
  loadAllQuestions,
  recordAnswersResilient,
} from '../state.js';
import { el, clear, svgIcon } from '../ui.js';
import { t } from '../i18n.js';
import { playCorrect, playWrong } from '../sound.js';
import { errorBanner, translationOf, loc, translationArea, feedbackHref } from './common.js';
import { numbersQueue, numberSpans } from '../domain/learning.js';

const DRILL_SIZE = 20;

export async function renderNumbers(root) {
  clear(root,
    el('h1', {}, t('nm.title')),
    el('p.lede', {}, t('ms.loading')),
  );
  let numbers, lessons, theory, questions;
  try {
    [numbers, lessons, theory, questions] = await Promise.all([
      loadNumbers(), loadLessons(), loadTheory(), loadAllQuestions(),
    ]);
  } catch (err) {
    return clear(root, errorBanner(err));
  }
  drawTable(root, numbers, lessons, theory, questions);
}

/** Chapter id → display title (theory.json carries the titles). */
function chapterTitles(theory) {
  const byId = new Map((theory?.chapters || []).map((c) => [c.id, c.title_it]));
  return (id) => byId.get(id) || `Cap. ${String(id).replace(/\D/g, '')}`;
}

/** The lesson note behind a table row (multilingual {en,ru,zh} or null). */
function noteFor(lessons, row) {
  const ch = lessons?.chapters?.[row.chapter];
  const fact = (ch?.mustKnow || []).find((m) => m.fact_it === row.fact);
  return fact?.note || null;
}

function tableBlock(numbers, lessons, titleOf) {
  const rows = numbers.table || [];
  const byChapter = new Map();
  for (const row of rows) {
    if (!byChapter.has(row.chapter)) byChapter.set(row.chapter, []);
    byChapter.get(row.chapter).push(row);
  }
  const chapters = [...byChapter.entries()].sort((a, b) =>
    Number(String(a[0]).replace(/\D/g, '')) - Number(String(b[0]).replace(/\D/g, '')));
  const total = rows.reduce((s, r) => s + r.questions, 0);

  return el('div.panel', {},
    el('h1', {}, t('nm.title')),
    el('p.lede', {}, t('nm.lede', { facts: rows.length, questions: total })),
    ...chapters.map(([ch, chRows]) => el('section.numbers-chapter', {},
      el('h2.numbers-chapter__title', {}, titleOf(ch)),
      ...chRows.map((r) => el('div.numbers-fact', {},
        el('div.numbers-fact__head', {},
          el('span.numbers-fact__name', {}, r.fact),
          el('span.numbers-fact__value', {}, r.value)),
        noteFor(lessons, r) ? el('p.numbers-fact__note', {}, loc(noteFor(lessons, r))) : null,
        el('p.numbers-fact__sub', {},
          t(r.questions === 1 ? 'nm.factsOne' : 'nm.factsMany', { n: r.questions })),
      )),
    )),
  );
}

/** State 1 — the reference table plus the drill entry point. */
function drawTable(root, numbers, lessons, theory, questions) {
  clear(root,
    tableBlock(numbers, lessons, chapterTitles(theory)),
    el('div.actions', { style: 'margin-top:24px' },
      el('button.btn.btn-primary.btn-big', { type: 'button', onclick: () =>
        drawDrill(root, numbers, questions) }, t('nm.drillStart')),
    ),
  );
}

/** State 2 — the 20-question FALSO/VERO drill (mirrors views/drill.js). */
function drawDrill(root, numbers, questions) {
  const pool = numbersQueue(questions, numbers, DRILL_SIZE);
  // L4's numbersQueue targets 50/50 but tolerates skew when one side of the
  // bank runs dry — so we only need a usable pool, not an exact split.
  const falseCount = pool.filter((q) => q.is_true === false).length;
  const trueCount = pool.length - falseCount;
  if (pool.length < 10 || falseCount === 0 || trueCount === 0) {
    return clear(root,
      el('h1', {}, t('nm.title')),
      errorBanner(new Error(
        t('nm.poolError', { found: pool.length, false: falseCount, true: trueCount }))),
    );
  }
  // Token → counts, so the feedback can say «50 — FALSO in 62% of the bank».
  const tokenById = new Map((numbers.tokens || []).map((t) => [t.token, t]));

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
        el('h1', {}, t('nm.complete')),
        el('p.stat-value.ok', {}, `${correctCount}/${total}`),
        el('p.lede', {}, t('pr.correctAnswers')),
        el('div.actions', { style: 'justify-content:center' },
          el('button.btn.btn-primary', { type: 'button', onclick: () =>
            drawDrill(root, numbers, questions) }, t('pr.oneMore')),
          el('a.btn', { href: '#/exam-italian' }, t('nm.examGuide')),
          el('a.btn', { href: '#/' }, t('pr.dashboard')),
        ),
      ),
    );
  }

  function numberNote(q) {
    const tok = tokenById.get(q.number);
    if (!tok || !tok.total) return null;
    const pct = Math.round((tok.false / tok.total) * 100);
    const nodes = [el('p.signal-ratio', {}, t('nm.falsoShare', { number: q.number, pct }))];
    if (q.is_true) nodes.push(el('p.signal-true', {}, t('nm.trueNote')));
    return el('div.signal-notes', {}, ...nodes);
  }

  function buildFeedbackPanel(q) {
    const panel = el('div', {
      className: `ds-feedback ${lastCorrect ? 'ds-feedback--ok' : 'ds-feedback--bad'}`,
      role: 'status',
    },
      el('div.ds-feedback__head', {},
        svgIcon(lastCorrect ? 'check' : 'cross'),
        lastCorrect ? t('pr.correct') : t('pr.wrong')),
      lastCorrect
        ? null
        : el('div.ds-feedback__answer', {}, t('pr.rightAnswer', { ans: q.is_true ? 'Vero' : 'Falso' })),
    );
    const note = numberNote(q);
    if (note) panel.append(note);
    panel.append(
      el('div.ds-feedback__actions', {},
        el('button.btn.btn-primary', { type: 'button', onclick: next },
          index + 1 >= pool.length ? t('pr.finish') : t('pr.next')),
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
        if (picked && lastCorrect) { stateStr = 'ds-answer--ok'; word = t('pr.correct'); }
        else if (picked && !lastCorrect) { stateStr = 'ds-answer--bad'; word = t('pr.wrong'); }
        else if (!picked && !lastCorrect && isRight) { stateStr = 'ds-answer--reveal'; word = t('pr.rightAnswerTag'); }
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
    return numberSpans(q.text_it, q.number ? [q.number] : []).map((s) =>
      s.mark ? el('mark.ds-signal', {}, s.text) : s.text);
  }

  function draw() {
    const q = pool[index];
    clear(root,
      offline
        ? el('p.offline-note', { role: 'status' }, t('pr.offline'))
        : null,
      el('div.quiz-head', {},
        el('a.btn', { href: '#/numbers' }, t('nm.backToTable')),
        el('span.quiz-progress', {}, t('nm.progress', { n: index + 1, total })),
        el('span.tag.ok', {}, t('nm.correctTag', { n: correctCount })),
      ),
      el('div.panel.question-card', {},
        q.image_url ? el('img.question-img', {
          src: q.image_url, alt: t('nm.imgAlt'),
          onerror: (e) => e.target.remove(),
        }) : null,
        el('p.question-text', {}, ...questionText(q)),
        translationArea(translationOf(q), revealed, reveal),
        answerButtons(q),
        answered ? (feedbackPanel ??= buildFeedbackPanel(q)) : null,
        el('p.kbd-hint', {},
          answered
            ? [el('kbd', {}, 'ENTER'), t('pr.kbdNext'), el('kbd', {}, 'T'), t('pr.kbdTranslate')]
            : [el('kbd', {}, 'V'), t('pr.kbdTrue'), el('kbd', {}, 'F'), t('pr.kbdFalse'), el('kbd', {}, 'T'), t('pr.kbdTranslate')]),
      ),
    );
  }

  draw();
}
